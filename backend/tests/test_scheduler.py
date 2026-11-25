"""Live ingestion polling opens intake tickets from new Graph incidents."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.ingestion.scheduler import IngestionScheduler
from app.models.security import CanonicalSecurityEvent
from app.models.workflow import Ticket
from app.schemas.security import PollSummary
from app.timeutil import utcnow
from tests.conftest import TENANT_ID


class _Pipeline:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def poll_tenant(self, tenant_id: str) -> PollSummary:
        self.calls.append(tenant_id)
        return PollSummary(tenant_id=tenant_id, feeds=[])


@pytest.mark.asyncio
async def test_scheduler_opens_each_graph_incident_once(runtime):
    async with runtime.sessions() as session:
        async with session.begin():
            session.add(
                CanonicalSecurityEvent(
                    source="microsoft_graph_security",
                    tenant_id=TENANT_ID,
                    event_type="security.incident",
                    external_id="incident-9",
                    actor="ada@contoso.com",
                    device="test-device-01",
                    resource="Impossible travel",
                    severity="high",
                    feed_type="incidents",
                    raw_payload_hash="a" * 64,
                    raw_payload={"id": "incident-9"},
                    ingested_at=utcnow(),
                )
            )
    runtime.pipeline = _Pipeline()
    scheduler = IngestionScheduler(runtime, interval_seconds=60)
    first = await scheduler.sync_tenant(TENANT_ID)
    second = await scheduler.sync_tenant(TENANT_ID)
    assert first["tickets_opened"] == 1
    assert second["tickets_opened"] == 0
    assert runtime.pipeline.calls == [TENANT_ID, TENANT_ID]
    assert first["last_poll_at"] == runtime.last_poll_at
    async with runtime.sessions() as session:
        ticket = await session.scalar(select(Ticket).where(Ticket.graph_incident_id == "incident-9"))
    assert ticket is not None
    assert ticket.stage == "1. INTAKE"
    assert ticket.source == "m365_detection"
    assert ticket.priority == "P2"
    assert "ada@contoso.com" not in ticket.description
    assert ticket.user_principal_name == "ada@contoso.com"


@pytest.mark.asyncio
async def test_sync_now_stays_closed_until_the_pipeline_is_ready(api):
    client, _runtime = api
    analyst = {
        "X-Trinetra-Tenant": TENANT_ID,
        "X-Trinetra-Role": "SOC_ANALYST",
        "X-Trinetra-Subject": "analyst-1",
    }
    commander = {
        "X-Trinetra-Tenant": TENANT_ID,
        "X-Trinetra-Role": "INCIDENT_COMMANDER",
        "X-Trinetra-Subject": "commander-1",
    }
    denied = await client.post("/api/v1/ingestion/sync-now", headers=analyst)
    assert denied.status_code == 403
    waiting = await client.post("/api/v1/ingestion/sync-now", headers=commander)
    assert waiting.status_code == 503
