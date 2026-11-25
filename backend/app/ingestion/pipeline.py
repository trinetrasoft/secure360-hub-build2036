"""Normalize Microsoft 365 payloads and advance per-tenant checkpoints.

Every outbound Microsoft call made for a poll goes through
``request_with_backoff``. HTTP 429 honors ``Retry-After`` and otherwise waits
with exponential backoff. A checkpoint moves only after the events for that
page or window have been committed, so a restart replays the overlap and
dedups on ``(tenant_id, source, external_id)`` instead of dropping data.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from collections.abc import Callable, Mapping
from datetime import datetime, timedelta
from typing import Any

import httpx

from app.config import Settings
from app.connectors.auth import (
    LeastPrivilegeError,
    M365AuthError,
    SecretNotFoundError,
    TokenResource,
)
from app.connectors.m365_client import (
    FEED_ALERTS,
    FEED_INCIDENTS,
    O365_CONTENT_TYPES,
    GraphSecurityClient,
    M365ClientError,
    Office365ManagementClient,
    allowed_hosts_for,
)
from app.connectors.retry import ThrottledError, request_with_backoff
from app.ingestion.store import (
    SessionFactory,
    blob_exists,
    get_checkpoint,
    get_envelope,
    mark_blob,
    mark_envelope,
    pending_envelope_ids,
    save_checkpoint,
    save_event,
)
from app.schemas.security import (
    SOURCE_GRAPH,
    SOURCE_O365,
    CanonicalSecurityEvent,
    FeedPollResult,
    PollSummary,
)
from app.timeutil import ensure_utc, format_graph, parse_datetime, utcnow

logger = logging.getLogger(__name__)

# Re-exported so ingestion callers share one throttling policy with the clients.
__all__ = [
    "IngestionPipeline",
    "normalize_graph_alert",
    "normalize_graph_incident",
    "normalize_o365_audit",
    "raw_payload_hash",
    "request_with_backoff",
]

_FEED_ERRORS = (M365ClientError, ThrottledError, M365AuthError, LeastPrivilegeError, SecretNotFoundError)

_SEVERITY = {
    "informational": "informational",
    "unknown": "informational",
    "low": "low",
    "medium": "medium",
    "high": "high",
    "critical": "critical",
}


def raw_payload_hash(payload: Mapping[str, Any]) -> str:
    """SHA-256 of canonical JSON. Key order does not change the digest."""
    encoded = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        default=_json_default,
    )
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _json_default(value: Any) -> str:
    if isinstance(value, datetime):
        return ensure_utc(value).isoformat()
    raise TypeError(f"cannot hash payload value of type {type(value).__name__}")


def normalize_graph_incident(tenant_id: str, payload: dict[str, Any]) -> CanonicalSecurityEvent:
    """Map a Graph ``security/incidents`` resource into the canonical schema."""
    return CanonicalSecurityEvent(
        source=SOURCE_GRAPH,
        tenant_id=tenant_id,
        event_type="security.incident",
        actor=_as_str(payload.get("assignedTo") or payload.get("lastModifiedBy")),
        device=_incident_device(payload),
        resource=_as_str(payload.get("displayName")),
        severity=_severity(payload.get("severity")),
        raw_payload_hash=raw_payload_hash(payload),
        external_id=_external_id(payload, "id"),
        feed_type=FEED_INCIDENTS,
        occurred_at=_parse_optional(payload.get("lastUpdateDateTime") or payload.get("createdDateTime")),
    )


def normalize_graph_alert(tenant_id: str, payload: dict[str, Any]) -> CanonicalSecurityEvent:
    """Map a Graph ``security/alerts_v2`` resource into the canonical schema."""
    return CanonicalSecurityEvent(
        source=SOURCE_GRAPH,
        tenant_id=tenant_id,
        event_type="security.alert",
        actor=_alert_actor(payload),
        device=_alert_device(payload),
        resource=_alert_resource(payload),
        severity=_severity(payload.get("severity")),
        raw_payload_hash=raw_payload_hash(payload),
        external_id=_external_id(payload, "id"),
        feed_type=FEED_ALERTS,
        occurred_at=_parse_optional(payload.get("lastUpdateDateTime") or payload.get("createdDateTime")),
    )


def normalize_o365_audit(
    tenant_id: str,
    content_type: str,
    payload: dict[str, Any],
) -> CanonicalSecurityEvent:
    """Map one Office 365 Management Activity record.

    The stored ``tenant_id`` is the tenant whose token fetched the blob, not
    ``OrganizationId`` from the record.
    """
    workload = str(payload.get("Workload") or _workload_name(content_type)).strip().lower() or "general"
    operation = str(payload.get("Operation") or "event").strip().lower() or "event"
    return CanonicalSecurityEvent(
        source=SOURCE_O365,
        tenant_id=tenant_id,
        event_type=f"audit.{workload}.{operation}"[:256],
        actor=_as_str(payload.get("UserId") or payload.get("UserKey")),
        device=_as_str(payload.get("ClientIP") or payload.get("ClientIPAddress")),
        resource=_as_str(
            payload.get("ObjectId") or payload.get("SiteUrl") or payload.get("MailboxOwnerUPN")
        ),
        severity=_audit_severity(payload, content_type),
        raw_payload_hash=raw_payload_hash(payload),
        external_id=_external_id(payload, "Id"),
        feed_type=content_type,
        occurred_at=_parse_optional(payload.get("CreationTime")),
    )


class IngestionPipeline:
    """Poll Graph and the activity feed, and drain the webhook inbox."""

    def __init__(
        self,
        *,
        session_factory: SessionFactory,
        secrets: Any,
        tokens: Any,
        http: httpx.AsyncClient,
        settings: Settings,
        clock: Callable[[], datetime] | None = None,
        sleeper: Callable[[float], Any] | None = None,
    ):
        self._sessions = session_factory
        self._secrets = secrets
        self._tokens = tokens
        self._settings = settings
        self._clock = clock or utcnow
        wait = sleeper or asyncio.sleep
        hosts = allowed_hosts_for(settings.graph_base_url, settings.manage_base_url)
        self._graph = GraphSecurityClient(
            http,
            base_url=settings.graph_base_url,
            allowed_hosts=hosts,
            max_attempts=settings.max_http_attempts,
            sleeper=wait,
        )
        self._o365 = Office365ManagementClient(
            http,
            base_url=settings.manage_base_url,
            allowed_hosts=hosts,
            max_attempts=settings.max_http_attempts,
            sleeper=wait,
        )

    async def poll_tenant(self, tenant_id: str) -> PollSummary:
        credentials = await self._secrets.get_credentials(tenant_id)
        feeds: list[FeedPollResult] = []
        try:
            graph_token = await self._tokens.get_access_token(credentials, TokenResource.GRAPH)
        except _FEED_ERRORS as exc:
            for feed_type in (FEED_INCIDENTS, FEED_ALERTS):
                feeds.append(FeedPollResult(feed_type=feed_type, error=str(exc)))
            graph_token = None
        if graph_token is not None:
            for feed_type in (FEED_INCIDENTS, FEED_ALERTS):
                feeds.append(await self._run_feed(tenant_id, graph_token, feed_type))

        if "ActivityFeed.Read" not in credentials.permissions:
            return PollSummary(tenant_id=tenant_id, feeds=feeds)

        try:
            o365_token = await self._tokens.get_access_token(credentials, TokenResource.O365)
        except _FEED_ERRORS as exc:
            for content_type in O365_CONTENT_TYPES:
                feeds.append(FeedPollResult(feed_type=content_type, error=str(exc)))
            return PollSummary(tenant_id=tenant_id, feeds=feeds)

        for content_type in O365_CONTENT_TYPES:
            feeds.append(await self._run_feed(tenant_id, o365_token, content_type))
        return PollSummary(tenant_id=tenant_id, feeds=feeds)

    async def start_subscriptions(self, tenant_id: str) -> list[dict[str, str]]:
        credentials = await self._secrets.get_credentials(tenant_id)
        auth_id = _secret_or_none(credentials.webhook_auth_id) or _secret_or_none(
            self._settings.webhook_auth_id
        )
        if not self._settings.webhook_url or not auth_id:
            raise M365ClientError("webhook URL and auth id are required to start subscriptions")
        token = await self._tokens.get_access_token(credentials, TokenResource.O365)
        return await self._o365.start_all(
            token,
            tenant_id,
            webhook_url=self._settings.webhook_url,
            auth_id=auth_id,
        )

    async def consume(self, queue: asyncio.Queue[str]) -> None:
        """Drain envelopes that were queued before this process started, then wait."""
        for envelope_id in await pending_envelope_ids(self._sessions):
            queue.put_nowait(envelope_id)
        while True:
            envelope_id = await queue.get()
            try:
                await self.process_envelope(envelope_id)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.exception("webhook envelope %s failed", envelope_id)
                await mark_envelope(self._sessions, envelope_id, "failed", str(exc)[:300])
            finally:
                queue.task_done()

    async def process_envelope(self, envelope_id: str) -> None:
        envelope = await get_envelope(self._sessions, envelope_id)
        if envelope is None or envelope.status == "processed":
            return
        if envelope.kind == "graph":
            await self._ingest_graph_notification(envelope.tenant_id, envelope.notification)
        elif envelope.kind == "o365":
            await self._ingest_o365_blob(envelope.tenant_id, envelope.notification)
        else:
            raise M365ClientError("unknown notification kind")
        await mark_envelope(self._sessions, envelope_id, "processed")

    async def _run_feed(self, tenant_id: str, token: str, feed_type: str) -> FeedPollResult:
        try:
            if feed_type in {FEED_INCIDENTS, FEED_ALERTS}:
                return await self._poll_graph(tenant_id, token, feed_type)
            return await self._poll_o365(tenant_id, token, feed_type)
        except _FEED_ERRORS as exc:
            logger.warning("feed %s for tenant %s failed: %s", feed_type, tenant_id, exc)
            return FeedPollResult(feed_type=feed_type, error=str(exc))

    async def _poll_graph(self, tenant_id: str, token: str, feed_type: str) -> FeedPollResult:
        stored = await self._floor_checkpoint(tenant_id, feed_type)
        if feed_type == FEED_INCIDENTS:
            iterator = self._graph.iter_incidents(token, stored)
            normalize = normalize_graph_incident
        else:
            iterator = self._graph.iter_alerts(token, stored)
            normalize = normalize_graph_alert
        counts = {"inserted": 0, "updated": 0, "duplicates": 0}
        newest = stored
        async for raw in iterator:
            event = normalize(tenant_id, raw)
            outcome = await save_event(self._sessions, event, raw)
            _count_outcome(counts, outcome)
            cursor = _graph_cursor(raw)
            if cursor is not None and cursor > newest:
                newest = cursor
        if newest > stored:
            await save_checkpoint(self._sessions, tenant_id, feed_type, newest)
        return FeedPollResult(
            feed_type=feed_type,
            inserted=counts["inserted"],
            updated=counts["updated"],
            duplicates=counts["duplicates"],
            checkpoint=format_graph(newest),
        )

    async def _poll_o365(self, tenant_id: str, token: str, content_type: str) -> FeedPollResult:
        stored = await self._floor_checkpoint(tenant_id, content_type)
        start = stored - timedelta(seconds=self._settings.o365_overlap_seconds)
        end = ensure_utc(self._clock())
        if end <= start:
            end = start + timedelta(seconds=1)
        blobs = await self._o365.list_content(token, tenant_id, content_type, start, end)
        counts = {"inserted": 0, "updated": 0, "duplicates": 0}
        for blob in blobs:
            content_id = blob.get("contentId")
            content_uri = blob.get("contentUri")
            if not isinstance(content_uri, str):
                continue
            if isinstance(content_id, str) and content_id and await blob_exists(
                self._sessions, tenant_id, content_id
            ):
                continue
            records = await self._o365.fetch_blob(token, content_uri)
            for record in records:
                event = normalize_o365_audit(tenant_id, content_type, record)
                outcome = await save_event(self._sessions, event, record)
                _count_outcome(counts, outcome)
            if isinstance(content_id, str) and content_id:
                await mark_blob(self._sessions, tenant_id, content_id, content_type)
        if end > stored:
            await save_checkpoint(self._sessions, tenant_id, content_type, end)
        return FeedPollResult(
            feed_type=content_type,
            inserted=counts["inserted"],
            updated=counts["updated"],
            duplicates=counts["duplicates"],
            checkpoint=format_graph(end),
        )

    async def _floor_checkpoint(self, tenant_id: str, feed_type: str) -> datetime:
        stored = await get_checkpoint(self._sessions, tenant_id, feed_type)
        if stored is not None:
            return stored
        floor = ensure_utc(self._clock()) - timedelta(hours=self._settings.initial_lookback_hours)
        await save_checkpoint(self._sessions, tenant_id, feed_type, floor)
        return floor

    async def _ingest_graph_notification(
        self,
        tenant_id: str | None,
        notification: dict[str, Any],
    ) -> None:
        if not tenant_id:
            raise M365ClientError("graph notification is missing a tenant id")
        resource = notification.get("resource")
        if not isinstance(resource, str):
            raise M365ClientError("graph notification is missing a resource")
        credentials = await self._secrets.get_credentials(tenant_id)
        token = await self._tokens.get_access_token(credentials, TokenResource.GRAPH)
        raw = await self._graph.get_resource(token, resource)
        if "/security/alerts_v2/" in f"/{resource.lstrip('/')}":
            event = normalize_graph_alert(tenant_id, raw)
        else:
            event = normalize_graph_incident(tenant_id, raw)
        await save_event(self._sessions, event, raw)

    async def _ingest_o365_blob(self, tenant_id: str | None, blob: dict[str, Any]) -> None:
        content_uri = blob.get("contentUri")
        if not isinstance(content_uri, str):
            raise M365ClientError("activity notification is missing contentUri")
        if not tenant_id:
            raise M365ClientError("activity notification is missing a tenant id")
        content_id = blob.get("contentId")
        content_type = str(blob.get("contentType") or "Audit.General")
        if isinstance(content_id, str) and content_id and await blob_exists(
            self._sessions, tenant_id, content_id
        ):
            return
        credentials = await self._secrets.get_credentials(tenant_id)
        token = await self._tokens.get_access_token(credentials, TokenResource.O365)
        for record in await self._o365.fetch_blob(token, content_uri):
            event = normalize_o365_audit(tenant_id, content_type, record)
            await save_event(self._sessions, event, record)
        if isinstance(content_id, str) and content_id:
            await mark_blob(self._sessions, tenant_id, content_id, content_type)


def _count_outcome(counts: dict[str, int], outcome: str) -> None:
    key = {"inserted": "inserted", "updated": "updated", "duplicate": "duplicates"}[outcome]
    counts[key] = counts.get(key, 0) + 1


def _secret_or_none(value: Any) -> str | None:
    if value is None:
        return None
    revealed = value.get_secret_value()
    return revealed or None


def _external_id(payload: Mapping[str, Any], key: str) -> str:
    value = payload.get(key) or payload.get(key.lower()) or payload.get(key.upper())
    if isinstance(value, str) and value.strip():
        return value.strip()
    return raw_payload_hash(payload)


def _as_str(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        return text or None
    if isinstance(value, dict):
        for key in ("userPrincipalName", "displayName", "upn", "id"):
            item = value.get(key)
            if isinstance(item, str) and item.strip():
                return item.strip()
        return None
    text = str(value).strip()
    return text or None


def _severity(value: Any, default: str = "informational") -> str:
    if isinstance(value, str) and value.lower() in _SEVERITY:
        return _SEVERITY[value.lower()]
    return default


def _audit_severity(payload: Mapping[str, Any], content_type: str) -> str:
    for key in ("Severity", "IncidentSeverity", "severity"):
        mapped = _severity(payload.get(key), default="")
        if mapped:
            return mapped
    if content_type == "DLP.All":
        return "medium"
    return "informational"


def _parse_optional(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    return parse_datetime(value)


def _graph_cursor(payload: Mapping[str, Any]) -> datetime | None:
    return _parse_optional(payload.get("lastUpdateDateTime") or payload.get("createdDateTime"))


def _incident_device(payload: Mapping[str, Any]) -> str | None:
    alerts = payload.get("alerts")
    if isinstance(alerts, list):
        for alert in alerts:
            if isinstance(alert, dict):
                device = _alert_device(alert)
                if device:
                    return device
    return None


def _evidence(payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    rows = payload.get("evidence")
    if not isinstance(rows, list):
        return []
    return [row for row in rows if isinstance(row, dict)]


def _alert_actor(payload: Mapping[str, Any]) -> str | None:
    for evidence in _evidence(payload):
        kind = str(evidence.get("@odata.type") or "")
        if "userEvidence" in kind or "mailboxEvidence" in kind or "analyzedMessageEvidence" in kind:
            account = evidence.get("userAccount")
            actor = _as_str(account) or _as_str(evidence.get("upn") or evidence.get("primaryAddress"))
            if actor:
                return actor
    return _as_str(payload.get("actorDisplayName"))


def _alert_device(payload: Mapping[str, Any]) -> str | None:
    for evidence in _evidence(payload):
        kind = str(evidence.get("@odata.type") or "")
        if "deviceEvidence" in kind:
            device = _as_str(
                evidence.get("deviceDnsName") or evidence.get("hostName") or evidence.get("dnsName")
            )
            if device:
                return device
    return None


def _alert_resource(payload: Mapping[str, Any]) -> str | None:
    for evidence in _evidence(payload):
        kind = str(evidence.get("@odata.type") or "")
        if "urlEvidence" in kind:
            url = _as_str(evidence.get("url"))
            if url:
                return url
        if "fileEvidence" in kind:
            details = evidence.get("fileDetails")
            if isinstance(details, dict):
                name = _as_str(details.get("fileName"))
                if name:
                    return name
        if "cloudApplicationEvidence" in kind:
            name = _as_str(evidence.get("displayName"))
            if name:
                return name
    return _as_str(payload.get("title"))


def _workload_name(content_type: str) -> str:
    return {
        "Audit.AzureActiveDirectory": "azureactivedirectory",
        "Audit.Exchange": "exchange",
        "Audit.SharePoint": "sharepoint",
        "Audit.General": "general",
        "DLP.All": "dlp",
    }.get(content_type, "general")
