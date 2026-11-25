"""Append-only audit hash chain."""

from __future__ import annotations

import pytest
from sqlalchemy import delete, select, update

from app.governance.audit import (
    GENESIS,
    AuditChainError,
    AuditImmutabilityError,
    append_audit,
    verify_chain,
)
from app.models.governance import AuditLog
from app.processing.engine import ProcessingEngine
from tests.conftest import TENANT_ID
from tests.test_processing import _store_event

OTHER_TENANT = "33333333-3333-3333-3333-333333333333"


async def _append(session, tenant: str, action: str, summary: str) -> AuditLog:
    return await append_audit(
        session,
        tenant_id=tenant,
        actor="commander-1",
        role="INCIDENT_COMMANDER",
        action=action,
        target_type="incident",
        target_id="inc-1",
        summary=summary,
    )


@pytest.mark.asyncio
async def test_hash_chain_links_and_rejects_tampering(runtime):
    async with runtime.sessions() as session:
        async with session.begin():
            first = await _append(session, TENANT_ID, "api.read", "listed 1 incidents")
            second = await _append(session, TENANT_ID, "human.approval", "human approval recorded")
            third = await _append(session, TENANT_ID, "remediation", "remediation recorded: disable_user")
            await _append(session, OTHER_TENANT, "api.read", "other tenant")

    async with runtime.sessions() as session:
        rows = (
            await session.scalars(
                select(AuditLog).where(AuditLog.tenant_id == TENANT_ID).order_by(AuditLog.sequence)
            )
        ).all()
    assert [row.sequence for row in rows] == [1, 2, 3]
    assert rows[0].previous_hash == GENESIS
    assert rows[1].previous_hash == rows[0].record_hash
    assert rows[2].previous_hash == rows[1].record_hash
    assert verify_chain(list(rows))
    assert first.record_hash == rows[0].record_hash
    assert third.summary.startswith("remediation recorded")

    tampered = list(rows)
    tampered[1].record_hash = "ab" * 32
    assert verify_chain(tampered) is False

    with pytest.raises(AuditImmutabilityError):
        async with runtime.sessions() as session:
            async with session.begin():
                row = await session.get(AuditLog, rows[0].id)
                row.summary = "changed"

    with pytest.raises(AuditImmutabilityError):
        async with runtime.sessions() as session:
            async with session.begin():
                row = await session.get(AuditLog, rows[0].id)
                await session.delete(row)

    with pytest.raises(AuditImmutabilityError):
        async with runtime.sessions() as session:
            async with session.begin():
                await session.execute(update(AuditLog).values(summary="changed"))

    with pytest.raises(AuditImmutabilityError):
        async with runtime.sessions() as session:
            async with session.begin():
                await session.execute(delete(AuditLog))

    with pytest.raises(AuditChainError):
        async with runtime.sessions() as session:
            async with session.begin():
                session.add(
                    AuditLog(
                        tenant_id=TENANT_ID,
                        sequence=4,
                        actor="commander-1",
                        role="INCIDENT_COMMANDER",
                        action="api.read",
                        target_type="incident",
                        target_id="inc-1",
                        summary="forged",
                        created_at="2026-11-17T12:00:00Z",
                        previous_hash="f" * 64,
                        record_hash="e" * 64,
                    )
                )


@pytest.mark.asyncio
async def test_recommendation_prompt_is_masked_and_audited(api, runtime):
    await _store_event(
        runtime,
        external_id="prompt-alert",
        minutes=0,
        severity="high",
        actor="ada.lovelace@contoso.com",
        raw={"ClientIP": "198.51.100.20", "displayName": "Ada Lovelace", "documentTitle": "Salary.xlsx"},
    )
    summary = await ProcessingEngine().process_tenant(runtime.sessions, TENANT_ID)
    incident_id = summary.incidents[0].id
    client, _runtime = api
    headers = {
        "X-Trinetra-Tenant": TENANT_ID,
        "X-Trinetra-Role": "SOC_ANALYST",
        "X-Trinetra-Subject": "analyst-1",
    }
    response = await client.post(f"/api/v1/incidents/{incident_id}/recommend", headers=headers)
    assert response.status_code == 200
    prompt = response.json()["prompt"]
    assert "ada.lovelace@contoso.com" not in prompt
    assert "198.51.100.20" not in prompt
    assert "[USER_01]" in prompt
    assert "[IP_01]" in prompt

    async with runtime.sessions() as session:
        rows = (await session.scalars(select(AuditLog).where(AuditLog.tenant_id == TENANT_ID))).all()
    recommendation = [row for row in rows if row.action == "ai.recommendation"]
    assert len(recommendation) == 1
    assert "ada.lovelace@contoso.com" not in recommendation[0].summary
    assert verify_chain([row for row in rows if row.tenant_id == TENANT_ID])
