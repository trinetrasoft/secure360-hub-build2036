"""Live remediation executor and dual-audience tokens."""

from __future__ import annotations

import httpx
import pytest
import respx
from sqlalchemy import select

from app.config import Settings
from app.connectors.auth import (
    DEFENDER_CLIENT_CREDENTIAL_SCOPE,
    GRAPH_CLIENT_CREDENTIAL_SCOPE,
    TokenResource,
    MsalTokenProvider,
    TenantCredentials,
)
from app.connectors.graph_remediation import GraphRemediationError
from app.governance.guardrails import CanaryPolicyBlockedError, assert_live_canary
from app.models.governance import AuditLog
from app.models.workflow import Ticket
from app.workflow.executor import (
    LiveRemediationExecutor,
    MockRemediationExecutor,
    build_executor,
    require_vault_key,
)
from tests.conftest import CLIENT_ID, CLIENT_SECRET, TENANT_ID

EMAIL = "ada.lovelace@contoso.com"


class _FakeMsalApp:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def acquire_token_for_client(self, scopes):
        self.calls.append(list(scopes))
        audience = "graph" if "graph.microsoft.com" in scopes[0] else "defender"
        return {"access_token": f"{audience}-token", "expires_in": 3600}


class _Secrets:
    def __init__(self, credentials: TenantCredentials):
        self._credentials = credentials

    async def get_credentials(self, tenant_id: str) -> TenantCredentials:
        assert tenant_id == self._credentials.tenant_id
        return self._credentials


class _Tokens:
    def __init__(self) -> None:
        self.resources: list[TokenResource] = []

    async def get_access_token(self, credentials: TenantCredentials, resource: TokenResource) -> str:
        del credentials
        self.resources.append(resource)
        if resource is TokenResource.DEFENDER:
            return "defender-token"
        if resource is TokenResource.GRAPH:
            return "graph-token"
        raise AssertionError(resource)


def test_missing_vault_key_refuses_startup():
    with pytest.raises(RuntimeError, match="TRINETRA_VAULT_KEY is required"):
        require_vault_key(Settings())


def test_factory_defaults_to_mock_and_live_needs_a_client():
    mock_settings = Settings(execution_mode="mock")
    assert isinstance(build_executor(mock_settings), MockRemediationExecutor)
    live = Settings(execution_mode="live")
    with pytest.raises(RuntimeError, match="live execution requires"):
        build_executor(live)


@pytest.mark.asyncio
async def test_token_provider_uses_separate_graph_and_defender_audiences():
    apps: list[_FakeMsalApp] = []

    def factory(credentials):
        del credentials
        app = _FakeMsalApp()
        apps.append(app)
        return app

    credentials = TenantCredentials(
        tenant_id=TENANT_ID,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
    )
    provider = MsalTokenProvider(app_factory=factory)
    graph = await provider.get_access_token(credentials, TokenResource.GRAPH)
    defender = await provider.get_access_token(credentials, TokenResource.DEFENDER)
    assert graph == "graph-token"
    assert defender == "defender-token"
    assert apps[0].calls == [[GRAPH_CLIENT_CREDENTIAL_SCOPE], [DEFENDER_CLIENT_CREDENTIAL_SCOPE]]


@pytest.mark.asyncio
async def test_live_executor_calls_graph_and_defender_then_verifies_with_get():
    credentials = TenantCredentials(
        tenant_id=TENANT_ID,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
    )
    tokens = _Tokens()
    settings = Settings(execution_mode="live")
    async with httpx.AsyncClient() as http:
        executor = build_executor(
            settings,
            http=http,
            tokens=tokens,
            secrets=_Secrets(credentials),
        )
        assert isinstance(executor, LiveRemediationExecutor)
        with respx.mock(assert_all_called=True) as router:
            revoke = router.post(
                "https://graph.microsoft.com/v1.0/users/ada.lovelace@contoso.com/revokeSignInSessions"
            ).mock(return_value=httpx.Response(200, json={"value": True}))
            disable = router.patch(
                "https://graph.microsoft.com/v1.0/users/ada.lovelace@contoso.com"
            ).mock(return_value=httpx.Response(204))
            isolate = router.post(
                "https://api.security.microsoft.com/api/machines/machine-9/isolate"
            ).mock(return_value=httpx.Response(201, json={"id": "machine-9"}))
            patch = router.patch(
                "https://graph.microsoft.com/v1.0/security/incidents/incident-9"
            ).mock(return_value=httpx.Response(200, json={"status": "resolved"}))
            user_get = router.get(
                "https://graph.microsoft.com/v1.0/users/ada.lovelace@contoso.com"
            ).mock(
                return_value=httpx.Response(
                    200,
                    json={"id": EMAIL, "accountEnabled": False},
                )
            )
            device_get = router.get(
                "https://api.security.microsoft.com/api/machines/machine-9"
            ).mock(return_value=httpx.Response(200, json={"id": "machine-9"}))
            incident_get = router.get(
                "https://graph.microsoft.com/v1.0/security/incidents/incident-9"
            ).mock(
                return_value=httpx.Response(
                    200,
                    json={"id": "incident-9", "status": "resolved", "classification": "truePositive"},
                )
            )
            arguments = {"userId": EMAIL, "tenantId": TENANT_ID, "ticketId": "ticket-9"}
            await executor.execute("revokeSignInSessions", arguments)
            await executor.execute("disableUser", arguments)
            await executor.execute(
                "isolateDevice",
                {"deviceId": "machine-9", "tenantId": TENANT_ID, "ticketId": "ticket-9"},
            )
            await executor.execute(
                "patchIncident",
                {
                    "incidentId": "incident-9",
                    "status": "resolved",
                    "classification": "truePositive",
                    "tenantId": TENANT_ID,
                    "ticketId": "ticket-9",
                },
            )
            user = await executor.graph_get("user", EMAIL, tenant_id=TENANT_ID, ticket_id="ticket-9")
            device = await executor.graph_get(
                "device", "machine-9", tenant_id=TENANT_ID, ticket_id="ticket-9"
            )
            incident = await executor.graph_get(
                "incident", "incident-9", tenant_id=TENANT_ID, ticket_id="ticket-9"
            )
            router.get("https://graph.microsoft.com/v1.0/users/missing@contoso.com").mock(
                return_value=httpx.Response(404, json={"error": {"code": "Request_ResourceNotFound"}})
            )
            with pytest.raises(GraphRemediationError):
                await executor.graph_get("user", "missing@contoso.com", tenant_id=TENANT_ID)
    assert user["accountEnabled"] is False
    assert user["sessionsRevoked"] is True
    assert device["isolationState"] == "Isolated"
    assert incident["status"] == "resolved"
    assert revoke.calls[0].request.headers["authorization"] == "Bearer graph-token"
    assert disable.calls[0].request.headers["authorization"] == "Bearer graph-token"
    assert isolate.calls[0].request.headers["authorization"] == "Bearer defender-token"
    assert device_get.calls[0].request.headers["authorization"] == "Bearer defender-token"
    assert user_get.calls[0].request.headers["authorization"] == "Bearer graph-token"
    assert incident_get.calls[0].request.headers["authorization"] == "Bearer graph-token"
    assert patch.calls[0].request.headers["authorization"] == "Bearer graph-token"
    import json

    assert json.loads(disable.calls[0].request.content) == {"accountEnabled": False}
    assert json.loads(isolate.calls[0].request.content) == {
        "Comment": "Trinetra Secure 360 Hub Ticket #ticket-9",
        "IsolationType": "Full",
    }
    patched = json.loads(patch.calls[0].request.content)
    assert patched["status"] == "resolved"
    assert patched["classification"] == "truePositive"
    assert patched["determination"] == "malware"
    assert tokens.resources.count(TokenResource.GRAPH) >= 1
    assert tokens.resources.count(TokenResource.DEFENDER) >= 1


@pytest.mark.asyncio
async def test_health_reports_mock_mode_without_requesting_tokens(api):
    client, _runtime = api
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["execution_mode"] == "mock"
    assert body["last_poll_at"] is None
    assert body["connectors"]["graph"]["status"] == "skipped"
    assert body["connectors"]["graph"]["scope"] == GRAPH_CLIENT_CREDENTIAL_SCOPE
    assert body["connectors"]["defender"]["status"] == "skipped"
    assert body["connectors"]["defender"]["scope"] == DEFENDER_CLIENT_CREDENTIAL_SCOPE
    allowed = await client.get(
        "/api/v1/health",
        headers={"Origin": "http://localhost:5173"},
    )
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_canary_allowlist_is_optional_and_ignored_in_mock_mode():
    listed = Settings(
        execution_mode="mock",
        live_canary_targets=frozenset({"canary-user@contoso.com"}),
    )
    assert_live_canary(listed, "disableUser", {"userId": "other@contoso.com"})
    open_live = Settings(execution_mode="live", live_canary_targets=frozenset())
    assert_live_canary(open_live, "disableUser", {"userId": "other@contoso.com"})
    assert_live_canary(
        Settings(
            execution_mode="live",
            live_canary_targets=frozenset({"canary-user@contoso.com"}),
        ),
        "patchIncident",
        {"incidentId": "incident-9"},
    )


@pytest.mark.asyncio
async def test_live_canary_blocks_unknown_targets_and_allows_listed_ones():
    credentials = TenantCredentials(
        tenant_id=TENANT_ID,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
    )
    settings = Settings(
        execution_mode="live",
        live_canary_targets=frozenset({"canary-user@contoso.com", "test-device-01"}),
    )
    async with httpx.AsyncClient() as http:
        executor = LiveRemediationExecutor(http, _Tokens(), _Secrets(credentials), settings)
        with respx.mock(assert_all_called=False) as router:
            router.route(url__regex=r".*").mock(return_value=httpx.Response(500))
            with pytest.raises(CanaryPolicyBlockedError, match="disableUser"):
                await executor.execute(
                    "disableUser",
                    {"userId": "other@contoso.com", "tenantId": TENANT_ID},
                )
            with pytest.raises(CanaryPolicyBlockedError, match="revokeSignInSessions"):
                await executor.execute(
                    "revokeSignInSessions",
                    {"userId": "other@contoso.com", "tenantId": TENANT_ID},
                )
            with pytest.raises(CanaryPolicyBlockedError, match="isolateDevice"):
                await executor.execute(
                    "isolateDevice",
                    {"deviceId": "prod-laptop", "tenantId": TENANT_ID},
                )
            assert len(router.calls) == 0

        with respx.mock(assert_all_called=True) as router:
            router.patch(
                "https://graph.microsoft.com/v1.0/security/incidents/incident-9"
            ).mock(return_value=httpx.Response(200, json={"status": "resolved"}))
            router.patch(
                "https://graph.microsoft.com/v1.0/users/Canary-User@contoso.com"
            ).mock(return_value=httpx.Response(204))
            router.post(
                "https://api.security.microsoft.com/api/machines/test-device-01/isolate"
            ).mock(return_value=httpx.Response(201, json={"id": "test-device-01"}))
            patched = await executor.execute(
                "patchIncident",
                {
                    "incidentId": "incident-9",
                    "tenantId": TENANT_ID,
                    "status": "resolved",
                    "classification": "truePositive",
                },
            )
            disabled = await executor.execute(
                "disableUser",
                {"userId": "Canary-User@contoso.com", "tenantId": TENANT_ID},
            )
            isolated = await executor.execute(
                "isolateDevice",
                {"deviceId": "test-device-01", "tenantId": TENANT_ID, "ticketId": "ticket-9"},
            )
    assert patched["status"] == "resolved"
    assert disabled["accountEnabled"] is False
    assert isolated["isolationState"] == "Isolated"


@pytest.mark.asyncio
async def test_canary_block_is_written_to_the_audit_trail(api):
    client, runtime = api
    credentials = TenantCredentials(
        tenant_id=TENANT_ID,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
    )
    headers = {
        "X-Trinetra-Tenant": TENANT_ID,
        "X-Trinetra-Role": "SOC_ANALYST",
        "X-Trinetra-Subject": "analyst-1",
    }
    async with httpx.AsyncClient() as http:
        runtime.responder = LiveRemediationExecutor(
            http,
            _Tokens(),
            _Secrets(credentials),
            Settings(
                execution_mode="live",
                live_canary_targets=frozenset({"canary-user@contoso.com"}),
            ),
        )
        opened = await client.post(
            "/api/v1/tickets",
            headers=headers,
            json={
                "source": "m365_detection",
                "title": "Impossible travel",
                "description": "Impossible travel sign-in from an unrecognized network.",
                "priority": "P2",
                "user_principal_name": EMAIL,
            },
        )
        assert opened.status_code == 200, opened.text
        ticket_id = opened.json()["id"]
        body = opened.json()
        for _ in range(4):
            if body["stage"] == "4. ASSIGN":
                break
            advanced = await client.post(f"/api/v1/tickets/{ticket_id}/advance", headers=headers)
            assert advanced.status_code == 200, advanced.text
            body = advanced.json()
        assert body["stage"] == "4. ASSIGN"
        approved = await client.post(
            f"/api/v1/tickets/{ticket_id}/approve",
            headers=headers,
            json={"analyst_click": True},
        )
        assert approved.status_code == 200, approved.text
        blocked = await client.post(f"/api/v1/tickets/{ticket_id}/advance", headers=headers)
    assert blocked.status_code == 409
    assert "Canary policy blocked revokeSignInSessions" in blocked.json()["detail"]
    assert EMAIL not in blocked.text
    async with runtime.sessions() as session:
        from sqlalchemy import select

        rows = list(
            await session.scalars(select(AuditLog).where(AuditLog.action == "remediation.blocked"))
        )
        current = await session.get(Ticket, ticket_id)
    assert len(rows) == 1
    assert rows[0].summary == (
        "canary policy blocked revokeSignInSessions; "
        "target is outside TRINETRA_LIVE_CANARY_TARGETS"
    )
    assert EMAIL not in rows[0].summary
    assert current is not None
    assert current.stage == "4. ASSIGN"
