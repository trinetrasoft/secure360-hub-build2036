"""Live Microsoft Graph Security and Office 365 Management Activity clients.

Graph incidents and alerts_v2 are incremental polls. ``alerts_v2`` and
``security/incidents`` do not use the legacy webhook subscription model for the
full feed, so the cursor filter is ``lastUpdateDateTime gt {checkpoint}``.

The Office 365 Management Activity API covers Exchange Online, SharePoint,
OneDrive, Teams, Entra ID, and Purview:

- ``Audit.AzureActiveDirectory`` — Entra ID
- ``Audit.Exchange`` — Exchange Online
- ``Audit.SharePoint`` — SharePoint Online and OneDrive
- ``Audit.General`` — Microsoft Teams and other general workloads
- ``DLP.All`` — Microsoft Purview DLP

Content blobs are listed, then each ``contentUri`` is fetched. Notification
payloads are authorized here and enqueued by the FastAPI route; this module
does not perform the handshake HTTP response.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import datetime
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

import httpx

from app.connectors.auth import secrets_equal, validate_tenant_id
from app.connectors.retry import Sleeper, request_with_backoff
from app.timeutil import graph_checkpoint_filter, iter_windows, format_o365

logger = logging.getLogger(__name__)

FEED_INCIDENTS = "incidents"
FEED_ALERTS = "alerts_v2"
O365_CONTENT_TYPES = (
    "Audit.AzureActiveDirectory",
    "Audit.Exchange",
    "Audit.SharePoint",
    "Audit.General",
    "DLP.All",
)
_MAX_PAGES = 50
_DEFAULT_HOSTS = frozenset({"graph.microsoft.com", "manage.office.com"})


class M365ClientError(Exception):
    """A Microsoft 365 call failed or a URL was rejected."""

    def __init__(self, message: str, *, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class WebhookUnauthorized(Exception):
    """clientState or WebHook-AuthID did not match a configured secret."""


class WebhookPayloadError(Exception):
    """The notification body is not a Graph or activity-feed payload we accept."""


def allowed_hosts_for(graph_base_url: str, manage_base_url: str) -> set[str]:
    hosts = set(_DEFAULT_HOSTS)
    for base in (graph_base_url, manage_base_url):
        host = urlparse(base).hostname
        if host:
            hosts.add(host.lower().rstrip("."))
    return hosts


def assert_microsoft_url(url: str, allowed_hosts: set[str]) -> str:
    """Reject anything that is not an https URL on an allowed Microsoft host."""
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise M365ClientError("only https Microsoft endpoints are allowed")
    if parsed.username or parsed.password:
        raise M365ClientError("credentials in URLs are not allowed")
    host = (parsed.hostname or "").lower().rstrip(".")
    if not host:
        raise M365ClientError("content URL is missing a host")
    try:
        import ipaddress

        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise M365ClientError("refusing an IP address as a Microsoft endpoint")
    if host not in allowed_hosts:
        raise M365ClientError("content URL host is not an allowed Microsoft endpoint")
    return url


def assert_activity_content_uri(url: str, allowed_hosts: set[str]) -> str:
    """Allow only Office 365 Management Activity blob URLs, not Graph or other hosts."""
    checked = assert_microsoft_url(url, allowed_hosts)
    parsed = urlparse(checked)
    host = (parsed.hostname or "").lower().rstrip(".")
    if host == "graph.microsoft.com" or "/activity/feed/" not in parsed.path:
        raise M365ClientError("activity content URL is not an Office 365 management blob")
    return checked


def tenant_id_from_content_uri(url: str) -> str:
    """Extract the tenant GUID from ``/api/v1.0/{tenant}/activity/feed/...``."""
    parts = [part for part in urlparse(url).path.split("/") if part]
    if len(parts) < 3 or parts[0] != "api":
        raise M365ClientError("content URL is not an Office 365 activity feed URI")
    try:
        return validate_tenant_id(parts[2])
    except ValueError as exc:
        raise M365ClientError("content URL tenant id is not a directory GUID") from exc


def _validate_webhook_address(url: str) -> str:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme == "https" and host:
        return url
    if parsed.scheme == "http" and host in {"localhost", "127.0.0.1"}:
        return url
    raise M365ClientError("subscription webhook address must be https")


def _is_graph_resource(resource: str) -> bool:
    text = resource.strip()
    path = urlparse(text).path if text.startswith("https://") else "/" + text.lstrip("/")
    if any(part == ".." for part in path.split("/")):
        return False
    return "/security/incidents/" in path or "/security/alerts_v2/" in path


class _HttpCaller:
    def __init__(
        self,
        http: httpx.AsyncClient,
        *,
        allowed_hosts: set[str],
        max_attempts: int,
        sleeper: Sleeper,
    ):
        self._http = http
        self._allowed_hosts = allowed_hosts
        self._max_attempts = max_attempts
        self._sleeper = sleeper

    async def send(
        self,
        method: str,
        url: str,
        token: str,
        *,
        params: dict[str, str] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> httpx.Response:
        assert_microsoft_url(url, self._allowed_hosts)
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "client-request-id": str(uuid4()),
        }
        response = await request_with_backoff(
            self._http,
            method,
            url,
            headers=headers,
            params=params,
            json=json_body,
            max_attempts=self._max_attempts,
            sleeper=self._sleeper,
        )
        if 300 <= response.status_code < 400:
            raise M365ClientError("redirects from Microsoft 365 are not followed", status_code=response.status_code)
        if response.status_code >= 400:
            raise M365ClientError(
                f"Microsoft 365 returned HTTP {response.status_code}",
                status_code=response.status_code,
            )
        parsed = urlparse(url)
        logger.info("m365 %s %s%s -> %s", method, parsed.netloc, parsed.path, response.status_code)
        return response


class GraphSecurityClient:
    """Incremental poller for ``/security/incidents`` and ``/security/alerts_v2``."""

    def __init__(
        self,
        http: httpx.AsyncClient,
        *,
        base_url: str = "https://graph.microsoft.com/v1.0",
        allowed_hosts: set[str] | None = None,
        max_attempts: int = 5,
        sleeper: Sleeper | None = None,
    ):
        self._base = base_url.rstrip("/")
        hosts = set(allowed_hosts or _DEFAULT_HOSTS)
        host = urlparse(self._base).hostname
        if host:
            hosts.add(host.lower())
        import asyncio

        self._http = _HttpCaller(
            http,
            allowed_hosts=hosts,
            max_attempts=max_attempts,
            sleeper=sleeper or asyncio.sleep,
        )

    async def iter_incidents(
        self,
        token: str,
        checkpoint: datetime | None,
    ) -> AsyncIterator[dict[str, Any]]:
        async for item in self._paginate(token, f"{self._base}/security/incidents", checkpoint):
            yield item

    async def iter_alerts(
        self,
        token: str,
        checkpoint: datetime | None,
    ) -> AsyncIterator[dict[str, Any]]:
        async for item in self._paginate(token, f"{self._base}/security/alerts_v2", checkpoint):
            yield item

    async def get_resource(self, token: str, resource: str) -> dict[str, Any]:
        if not _is_graph_resource(resource):
            raise M365ClientError("unsupported graph resource")
        relative = resource.strip()
        if relative.startswith("https://"):
            url = relative
        else:
            url = f"{self._base}/{relative.lstrip('/')}"
        response = await self._http.send("GET", url, token)
        payload = _json_object(response)
        return payload

    async def _paginate(
        self,
        token: str,
        url: str,
        checkpoint: datetime | None,
    ) -> AsyncIterator[dict[str, Any]]:
        params: dict[str, str] | None = {"$top": "50"}
        if checkpoint is not None:
            params["$filter"] = graph_checkpoint_filter(checkpoint)
        pages = 0
        next_url: str | None = url
        while next_url:
            pages += 1
            if pages > _MAX_PAGES:
                raise M365ClientError("Graph pagination limit exceeded")
            response = await self._http.send("GET", next_url, token, params=params)
            payload = _json_object(response)
            for item in payload.get("value") or []:
                if isinstance(item, dict):
                    yield item
            next_link = payload.get("@odata.nextLink")
            next_url = next_link if isinstance(next_link, str) and next_link else None
            params = None


class Office365ManagementClient:
    """Subscription manager and content-blob fetcher for the activity feed."""

    def __init__(
        self,
        http: httpx.AsyncClient,
        *,
        base_url: str = "https://manage.office.com/api/v1.0",
        allowed_hosts: set[str] | None = None,
        max_attempts: int = 5,
        sleeper: Sleeper | None = None,
    ):
        self._base = base_url.rstrip("/")
        hosts = set(allowed_hosts or _DEFAULT_HOSTS)
        host = urlparse(self._base).hostname
        if host:
            hosts.add(host.lower())
        import asyncio

        self._http = _HttpCaller(
            http,
            allowed_hosts=hosts,
            max_attempts=max_attempts,
            sleeper=sleeper or asyncio.sleep,
        )

    async def start_subscription(
        self,
        token: str,
        tenant_id: str,
        content_type: str,
        *,
        webhook_url: str,
        auth_id: str,
    ) -> dict[str, str]:
        if content_type not in O365_CONTENT_TYPES:
            raise M365ClientError(f"unsupported activity content type {content_type}")
        validate_tenant_id(tenant_id)
        address = _validate_webhook_address(webhook_url)
        if not auth_id:
            raise M365ClientError("webhook auth id is required to start a subscription")
        url = f"{self._base}/{tenant_id}/activity/feed/subscriptions/start"
        response = await self._http.send(
            "POST",
            url,
            token,
            params={"contentType": content_type, "PublisherIdentifier": tenant_id},
            json_body={"webhook": {"address": address, "authId": auth_id, "expiration": ""}},
        )
        body = _json_maybe(response)
        status = "submitted"
        if isinstance(body, dict) and body.get("status"):
            status = str(body["status"])
        return {"contentType": content_type, "status": status}

    async def start_all(
        self,
        token: str,
        tenant_id: str,
        *,
        webhook_url: str,
        auth_id: str,
    ) -> list[dict[str, str]]:
        started: list[dict[str, str]] = []
        for content_type in O365_CONTENT_TYPES:
            started.append(
                await self.start_subscription(
                    token,
                    tenant_id,
                    content_type,
                    webhook_url=webhook_url,
                    auth_id=auth_id,
                )
            )
        return started

    async def list_content(
        self,
        token: str,
        tenant_id: str,
        content_type: str,
        start: datetime,
        end: datetime,
    ) -> list[dict[str, Any]]:
        if content_type not in O365_CONTENT_TYPES:
            raise M365ClientError(f"unsupported activity content type {content_type}")
        validate_tenant_id(tenant_id)
        blobs: list[dict[str, Any]] = []
        for window_start, window_end in iter_windows(start, end):
            url = f"{self._base}/{tenant_id}/activity/feed/subscriptions/content"
            params: dict[str, str] | None = {
                "contentType": content_type,
                "startTime": format_o365(window_start),
                "endTime": format_o365(window_end),
                "PublisherIdentifier": tenant_id,
            }
            pages = 0
            while url:
                pages += 1
                if pages > _MAX_PAGES:
                    raise M365ClientError("activity content pagination limit exceeded")
                response = await self._http.send("GET", url, token, params=params)
                payload = _json_maybe(response)
                rows = payload if isinstance(payload, list) else []
                if isinstance(payload, dict):
                    rows = payload.get("value") or []
                for item in rows:
                    if isinstance(item, dict):
                        blobs.append(item)
                header = response.headers.get("NextPageUri") or response.headers.get("NextPageUrl")
                url = header if isinstance(header, str) and header else ""
                params = None
                if not url:
                    break
        return blobs

    async def fetch_blob(self, token: str, content_uri: str) -> list[dict[str, Any]]:
        assert_activity_content_uri(content_uri, self._http._allowed_hosts)
        response = await self._http.send("GET", content_uri, token)
        payload = _json_maybe(response)
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        if isinstance(payload, dict):
            rows = payload.get("value") or []
            return [item for item in rows if isinstance(item, dict)]
        raise M365ClientError("activity content blob was not a JSON list")


def _json_object(response: httpx.Response) -> dict[str, Any]:
    payload = _json_maybe(response)
    if not isinstance(payload, dict):
        raise M365ClientError("Microsoft 365 returned a JSON value that was not an object")
    return payload


def _json_maybe(response: httpx.Response) -> Any:
    if not response.content:
        return {}
    try:
        return response.json()
    except ValueError as exc:
        raise M365ClientError("Microsoft 365 returned a non-JSON body") from exc


def _auth_header_ok(provided: str | None, accepted: set[str]) -> bool:
    if not provided or not accepted:
        return False
    matched = False
    for expected in accepted:
        matched = secrets_equal(provided, expected) or matched
    return matched


async def authorized_notifications(
    body: Any,
    *,
    auth_header: str | None,
    accepted_auth_ids: set[str],
    client_state_for_tenant: Callable[[str], Awaitable[str | None]],
    allowed_hosts: set[str],
) -> list[tuple[str, str, dict[str, Any]]]:
    """Validate a Graph or activity-feed notification and return items to enqueue.

    Graph items must carry a matching ``clientState``. Activity-feed batches
    must carry a matching ``WebHook-AuthID``. Content URIs are restricted to
    allowed Microsoft hosts before they are queued.
    """
    if isinstance(body, list):
        if not _auth_header_ok(auth_header, accepted_auth_ids):
            raise WebhookUnauthorized()
        if not body:
            raise WebhookPayloadError("empty activity notification")
        items: list[tuple[str, str, dict[str, Any]]] = []
        for entry in body:
            if not isinstance(entry, dict) or not isinstance(entry.get("contentUri"), str):
                raise WebhookPayloadError("invalid activity blob")
            try:
                content_uri = assert_activity_content_uri(entry["contentUri"], allowed_hosts)
                tenant_id = tenant_id_from_content_uri(content_uri)
            except M365ClientError as exc:
                raise WebhookPayloadError("invalid activity content url") from exc
            items.append(("o365", tenant_id, entry))
        return items

    if isinstance(body, dict) and "value" in body:
        if auth_header is not None and not _auth_header_ok(auth_header, accepted_auth_ids):
            raise WebhookUnauthorized()
        value = body.get("value")
        if not isinstance(value, list) or not value:
            raise WebhookPayloadError("invalid graph notification")
        items = []
        for entry in value:
            if not isinstance(entry, dict):
                raise WebhookPayloadError("invalid graph notification")
            tenant_id = entry.get("tenantId")
            resource = entry.get("resource")
            provided_state = entry.get("clientState")
            if not isinstance(tenant_id, str) or not isinstance(resource, str):
                raise WebhookUnauthorized()
            try:
                validate_tenant_id(tenant_id)
            except ValueError as exc:
                raise WebhookUnauthorized() from exc
            if not _is_graph_resource(resource):
                raise WebhookPayloadError("unsupported graph resource")
            expected = await client_state_for_tenant(tenant_id)
            if not isinstance(provided_state, str) or not secrets_equal(provided_state, expected or ""):
                raise WebhookUnauthorized()
            items.append(("graph", tenant_id, entry))
        return items

    raise WebhookPayloadError("unsupported notification payload")
