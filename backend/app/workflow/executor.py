"""Choose the mock responder or the live Graph and Defender client.

``TRINETRA_EXECUTION_MODE=mock`` is the default. ``live`` sends the four
approved remediation calls and the VERIFY stage GET to Microsoft. Tokens for
Graph and Defender are acquired separately, each as ``{resource}/.default``.
"""

from __future__ import annotations

import logging
from typing import Any, Protocol

from app.config import Settings
from app.connectors.auth import (
    DEFENDER_CLIENT_CREDENTIAL_SCOPE,
    GRAPH_CLIENT_CREDENTIAL_SCOPE,
    TokenResource,
)
from app.connectors.graph_remediation import GraphRemediationClient, GraphRemediationError
from app.connectors.mock_m365 import MockM365Responder
from app.governance.audit import append_audit
from app.governance.guardrails import CanaryPolicyBlockedError, PiiMasker, VaultKeyError, assert_live_canary

logger = logging.getLogger(__name__)


class RemediationExecutor(Protocol):
    """The RESOLVE and VERIFY stages call only this pair of methods."""

    async def execute(self, action: str, arguments: dict[str, Any]) -> dict[str, Any]: ...

    async def graph_get(
        self,
        resource: str,
        object_id: str,
        *,
        tenant_id: str | None = None,
        ticket_id: str | None = None,
    ) -> dict[str, Any]: ...


class MockRemediationExecutor:
    """In-process responder. It never opens a socket to Microsoft."""

    def __init__(self, inner: MockM365Responder | None = None):
        self._inner = inner or MockM365Responder()

    @property
    def calls(self) -> list[tuple[str, dict[str, Any]]]:
        return self._inner.calls

    async def execute(self, action: str, arguments: dict[str, Any]) -> dict[str, Any]:
        return await self._inner.execute(action, arguments)

    async def graph_get(
        self,
        resource: str,
        object_id: str,
        *,
        tenant_id: str | None = None,
        ticket_id: str | None = None,
    ) -> dict[str, Any]:
        del tenant_id, ticket_id
        return await self._inner.graph_get(resource, object_id)


class LiveRemediationExecutor:
    """Graph and Defender calls for one process-wide HTTP client."""

    def __init__(self, http: Any, tokens: Any, secrets: Any, settings: Settings):
        self._http = http
        self._tokens = tokens
        self._secrets = secrets
        self._settings = settings
        self._revoked: set[str] = set()
        self._notified: set[str] = set()
        self._enriched: set[str] = set()
        self._isolated: set[str] = set()
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def execute(self, action: str, arguments: dict[str, Any]) -> dict[str, Any]:
        assert_live_canary(self._settings, action, arguments)
        self.calls.append((action, dict(arguments)))
        if action == "notifyUser":
            self._notified.add(str(arguments["userId"]))
            return {"ok": True, "delivered": True}
        if action == "enrichAlert":
            self._enriched.add(str(arguments["incidentId"]))
            return {"ok": True, "enriched": True}
        client = await self._client(str(arguments["tenantId"]))
        outcome = await client.execute(action, arguments)
        if action == "revokeSignInSessions":
            self._revoked.add(str(arguments["userId"]))
        elif action == "isolateDevice":
            self._isolated.add(str(arguments["deviceId"]))
        return outcome

    async def graph_get(
        self,
        resource: str,
        object_id: str,
        *,
        tenant_id: str | None = None,
        ticket_id: str | None = None,
    ) -> dict[str, Any]:
        del ticket_id
        if not tenant_id:
            raise GraphRemediationError("live verification requires a tenant id")
        client = await self._client(tenant_id)
        body = await client.graph_get(resource, object_id)
        self.calls.append(("GET", {"resource": resource, "id": object_id}))
        return self._normalize(resource, object_id, body)

    async def _client(self, tenant_id: str) -> GraphRemediationClient:
        credentials = await self._secrets.get_credentials(tenant_id)
        graph_token = await self._tokens.get_access_token(credentials, TokenResource.GRAPH)
        defender_token = await self._tokens.get_access_token(credentials, TokenResource.DEFENDER)
        return GraphRemediationClient(
            self._http,
            graph_token,
            defender_token=defender_token,
            graph_base=self._settings.graph_base_url,
            defender_base="https://api.security.microsoft.com/api",
        )

    def _normalize(self, resource: str, object_id: str, body: dict[str, Any]) -> dict[str, Any]:
        merged = dict(body)
        if resource == "user":
            if object_id in self._revoked and body:
                merged["sessionsRevoked"] = True
            if object_id in self._notified and body:
                merged["notified"] = True
        elif resource == "device" and object_id in self._isolated and body.get("id"):
            merged["isolationState"] = body.get("isolationState") or "Isolated"
        elif resource == "incident" and object_id in self._enriched and body:
            merged["enriched"] = True
        return merged


def build_executor(
    settings: Settings,
    *,
    http: Any | None = None,
    tokens: Any | None = None,
    secrets: Any | None = None,
    responder: MockM365Responder | None = None,
) -> RemediationExecutor:
    """Return the mock executor unless live mode has an HTTP client."""
    if settings.execution_mode == "live":
        if http is None or tokens is None or secrets is None:
            raise RuntimeError("live execution requires an HTTP client and token provider")
        return LiveRemediationExecutor(http, tokens, secrets, settings)
    if settings.execution_mode != "mock":
        raise RuntimeError("TRINETRA_EXECUTION_MODE must be mock or live")
    return MockRemediationExecutor(responder)


async def record_canary_block(sessions: Any, block: dict[str, str]) -> None:
    """Append the canary rejection after the ticket transaction has rolled back."""
    logger.warning("canary policy blocked action %s", block.get("target_id", "remediation"))
    async with sessions() as session:
        async with session.begin():
            await append_audit(session, **block)


def require_vault_key(settings: Settings) -> None:
    """Refuse to start when the PII vault key is missing or unusable."""
    if settings.vault_key is None or not settings.vault_key.get_secret_value().strip():
        raise RuntimeError(
            "TRINETRA_VAULT_KEY is required. Refusing to start without a tenant vault key."
        )
    try:
        PiiMasker(settings.vault_key.get_secret_value())
    except VaultKeyError as exc:
        raise RuntimeError("TRINETRA_VAULT_KEY is not a valid Fernet key.") from exc


async def connector_token_health(settings: Settings, secrets: Any, tokens: Any) -> dict[str, dict[str, str]]:
    """Report Graph and Defender token health without returning token values."""
    scopes = {
        "graph": GRAPH_CLIENT_CREDENTIAL_SCOPE,
        "defender": DEFENDER_CLIENT_CREDENTIAL_SCOPE,
    }
    if settings.execution_mode != "live":
        return {name: {"scope": scope, "status": "skipped"} for name, scope in scopes.items()}
    tenant_ids = list(getattr(secrets, "known_tenant_ids", lambda: [])())
    if not tenant_ids:
        return {name: {"scope": scope, "status": "unconfigured"} for name, scope in scopes.items()}
    report: dict[str, dict[str, str]] = {}
    for name, resource in (
        ("graph", TokenResource.GRAPH),
        ("defender", TokenResource.DEFENDER),
    ):
        status = "ok"
        for tenant_id in tenant_ids:
            try:
                credentials = await secrets.get_credentials(tenant_id)
                await tokens.get_access_token(credentials, resource)
            except Exception:
                status = "error"
                break
        report[name] = {"scope": scopes[name], "status": status}
    return report
