"""Webhook handshake, authorization, and enqueue tests."""

from __future__ import annotations

import httpx
import pytest
import respx
from sqlalchemy import func, select

from app.connectors.auth import MsalTokenProvider
from app.ingestion.pipeline import IngestionPipeline
from app.ingestion.store import get_checkpoint, list_events
from app.models.security import WebhookInbox
from tests.conftest import TENANT_ID


async def _inbox_count(runtime) -> int:
    async with runtime.sessions() as session:
        count = await session.scalar(select(func.count()).select_from(WebhookInbox))
        return int(count or 0)


@pytest.mark.asyncio
async def test_validation_handshake_returns_decoded_plain_text(api):
    client, runtime = api
    response = await client.post("/api/v1/webhooks/m365?validationToken=abc%2Bdef%3D")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    assert response.text == "abc+def="
    assert not response.text.startswith("{")
    assert await _inbox_count(runtime) == 0
    assert runtime.queue.qsize() == 0

    lower = await client.post("/api/v1/webhooks/m365?validationtoken=plain-token")
    assert lower.status_code == 200
    assert lower.text == "plain-token"


@pytest.mark.asyncio
async def test_graph_notification_enqueues_only_with_matching_client_state(api):
    client, runtime = api
    payload = {
        "value": [
            {
                "subscriptionId": "sub-1",
                "clientState": "expected-state",
                "changeType": "updated",
                "resource": "security/incidents/inc-1",
                "tenantId": TENANT_ID,
            }
        ]
    }
    rejected = await client.post(
        "/api/v1/webhooks/m365",
        json={
            "value": [
                {
                    **payload["value"][0],
                    "clientState": "wrong-state",
                }
            ]
        },
    )
    assert rejected.status_code == 401
    assert runtime.queue.qsize() == 0
    assert await _inbox_count(runtime) == 0

    accepted = await client.post("/api/v1/webhooks/m365", json=payload)
    assert accepted.status_code == 202
    assert accepted.json() == {"enqueued": 1}
    assert runtime.queue.qsize() == 1
    assert await _inbox_count(runtime) == 1


@pytest.mark.asyncio
async def test_activity_webhook_checks_auth_id_and_rejects_foreign_urls(api):
    client, runtime = api
    blob = {
        "contentType": "Audit.SharePoint",
        "contentId": "blob-9",
        "contentUri": f"https://manage.office.com/api/v1.0/{TENANT_ID}/activity/feed/audit/blob-9",
        "contentCreated": "2026-11-17T11:00:00.000Z",
        "contentExpiration": "2026-11-24T11:00:00.000Z",
    }
    missing = await client.post("/api/v1/webhooks/m365", json=[blob])
    assert missing.status_code == 401

    forged = await client.post(
        "/api/v1/webhooks/m365",
        headers={"WebHook-AuthID": "expected-auth"},
        json=[
            {
                "contentType": "Audit.General",
                "contentId": "evil",
                "contentUri": "http://169.254.169.254/latest/meta-data",
            }
        ],
    )
    assert forged.status_code == 400
    assert runtime.queue.qsize() == 0

    accepted = await client.post(
        "/api/v1/webhooks/m365",
        headers={"WebHook-AuthID": "expected-auth"},
        json=[blob],
    )
    assert accepted.status_code == 202
    assert accepted.json()["enqueued"] == 1


@pytest.mark.asyncio
async def test_worker_ingests_graph_resource_without_moving_the_poll_cursor(api):
    client, runtime = api
    response = await client.post(
        "/api/v1/webhooks/m365",
        json={
            "value": [
                {
                    "clientState": "expected-state",
                    "changeType": "updated",
                    "resource": "security/incidents/inc-1",
                    "tenantId": TENANT_ID,
                }
            ]
        },
    )
    assert response.status_code == 202
    envelope_id = runtime.queue.get_nowait()

    class _App:
        def acquire_token_for_client(self, scopes):
            return {"access_token": "token", "expires_in": 3600}

    async with httpx.AsyncClient() as http:
        pipeline = IngestionPipeline(
            session_factory=runtime.sessions,
            secrets=runtime.secrets,
            tokens=MsalTokenProvider(app_factory=lambda credentials: _App()),
            http=http,
            settings=runtime.settings,
        )
        with respx.mock:
            respx.get("https://graph.microsoft.com/v1.0/security/incidents/inc-1").mock(
                return_value=httpx.Response(
                    200,
                    json={
                        "id": "inc-1",
                        "displayName": "Webhook incident",
                        "severity": "low",
                        "assignedTo": "analyst@contoso.com",
                        "lastUpdateDateTime": "2026-11-17T11:50:00Z",
                    },
                )
            )
            await pipeline.process_envelope(envelope_id)

    events = await list_events(runtime.sessions, tenant_id=TENANT_ID)
    assert len(events) == 1
    assert events[0].event_type == "security.incident"
    assert events[0].actor == "analyst@contoso.com"
    assert events[0].severity == "low"
    assert await get_checkpoint(runtime.sessions, TENANT_ID, "incidents") is None


@pytest.mark.asyncio
async def test_health_and_checkpoint_routes(api):
    client, runtime = api
    health = await client.get("/api/v1/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    class _Stub:
        async def poll_tenant(self, tenant_id: str):
            from app.schemas.security import FeedPollResult, PollSummary

            return PollSummary(
                tenant_id=tenant_id,
                feeds=[FeedPollResult(feed_type="incidents", inserted=0, checkpoint=None)],
            )

    runtime.pipeline = _Stub()
    headers = {
        "X-Trinetra-Tenant": TENANT_ID,
        "X-Trinetra-Role": "INCIDENT_COMMANDER",
        "X-Trinetra-Subject": "commander-1",
    }
    polled = await client.post(
        f"/api/v1/ingestion/tenants/{TENANT_ID}/poll",
        headers=headers,
    )
    assert polled.status_code == 200
    assert polled.json()["feeds"][0]["feed_type"] == "incidents"
    listed = await client.get(
        f"/api/v1/ingestion/tenants/{TENANT_ID}/checkpoints",
        headers=headers,
    )
    assert listed.status_code == 200
    assert listed.json() == []
