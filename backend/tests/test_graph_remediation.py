"""Approved Graph and Defender remediation request shapes."""

from __future__ import annotations

import json

import httpx
import pytest
import respx

from app.connectors.graph_remediation import GraphRemediationClient, GraphRemediationError


@pytest.mark.asyncio
async def test_approved_actions_use_graph_and_defender_gets():
    async with httpx.AsyncClient() as http:
        client = GraphRemediationClient(http, "graph-token")
        with respx.mock(assert_all_called=True) as mock:
            revoke = mock.post(
                "https://graph.microsoft.com/v1.0/users/ada@contoso.com/revokeSignInSessions"
            ).mock(return_value=httpx.Response(200, json={"value": True}))
            disable = mock.patch("https://graph.microsoft.com/v1.0/users/ada@contoso.com").mock(
                return_value=httpx.Response(204)
            )
            isolate = mock.post(
                "https://api.security.microsoft.com/api/machines/machine-1/isolate"
            ).mock(return_value=httpx.Response(201, json={}))
            patch = mock.patch(
                "https://graph.microsoft.com/v1.0/security/incidents/incident-1"
            ).mock(return_value=httpx.Response(200, json={"status": "resolved"}))
            read = mock.get("https://graph.microsoft.com/v1.0/users/ada@contoso.com").mock(
                return_value=httpx.Response(
                    200,
                    json={"accountEnabled": False, "id": "ada@contoso.com"},
                )
            )
            revoked = await client.execute("revokeSignInSessions", {"userId": "ada@contoso.com"})
            disabled = await client.execute("disableUser", {"userId": "ada@contoso.com"})
            isolated = await client.execute("isolateDevice", {"deviceId": "machine-1"})
            patched = await client.execute(
                "patchIncident",
                {"incidentId": "incident-1", "status": "resolved", "classification": "truePositive"},
            )
            current = await client.graph_get("user", "ada@contoso.com")
    assert revoked["sessionsRevoked"] is True
    assert disabled["accountEnabled"] is False
    assert isolated["isolationState"] == "Isolated"
    assert patched["status"] == "resolved"
    assert current["accountEnabled"] is False
    assert revoke.calls[0].request.headers["authorization"] == "Bearer graph-token"
    assert json.loads(disable.calls[0].request.content) == {"accountEnabled": False}
    assert json.loads(isolate.calls[0].request.content)["IsolationType"] == "Full"
    assert json.loads(patch.calls[0].request.content)["classification"] == "truePositive"
    assert read.called
    with pytest.raises(GraphRemediationError):
        await client.execute("disableUser", {"userId": "../admin"})
