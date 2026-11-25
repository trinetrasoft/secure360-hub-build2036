"""Masked recommendations, human decisions, and the audit chain."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select

from app.governance.audit import append_audit
from app.governance.guardrails import (
    PiiMasker,
    Principal,
    VaultKeyError,
    build_masked_prompt,
    require,
)
from app.models.processing import CorrelatedIncident
from app.runtime import Runtime
from app.schemas.operations import AuditRecordView, RecommendationView, RemediationBody

router = APIRouter()

REMEDIATION_ACTIONS = frozenset(
    {"isolate_device", "disable_user", "revoke_sessions", "reset_password"}
)


def _runtime(request: Request) -> Runtime:
    return request.app.state.runtime


def _masker(runtime: Runtime) -> PiiMasker:
    if runtime.settings.vault_key is None:
        raise HTTPException(status_code=503, detail="vault key is not configured")
    try:
        return PiiMasker(runtime.settings.vault_key.get_secret_value())
    except VaultKeyError:
        raise HTTPException(status_code=503, detail="vault key is not configured") from None


async def _incident_for(session, principal: Principal, incident_id: str) -> CorrelatedIncident:
    row = await session.get(CorrelatedIncident, incident_id)
    if row is None or row.tenant_id != principal.tenant_id:
        raise HTTPException(status_code=404, detail="incident not found")
    return row


def _telemetry(row: CorrelatedIncident) -> dict[str, object]:
    principals = list(row.user_principal_names or [])
    ips = list(row.source_ips or [])
    return {
        "userPrincipalName": principals[0] if principals else None,
        "ClientIP": ips[0] if ips else None,
        "displayName": None,
        "documentTitle": None,
        "priority": row.priority,
        "score": row.risk_score,
    }


@router.post(
    "/api/v1/incidents/{incident_id}/recommend",
    response_model=RecommendationView,
)
async def recommend(
    incident_id: str,
    request: Request,
    principal: Principal = Depends(require("ai:recommend")),
) -> RecommendationView:
    runtime = _runtime(request)
    masker = _masker(runtime)
    async with runtime.sessions() as session:
        async with session.begin():
            row = await _incident_for(session, principal, incident_id)
            masked = await masker.mask_telemetry(session, principal.tenant_id, _telemetry(row))
            prompt = build_masked_prompt(masked, row.priority, row.risk_score)
            await append_audit(
                session,
                tenant_id=principal.tenant_id,
                actor=principal.subject,
                role=principal.role,
                action="ai.recommendation",
                target_type="incident",
                target_id=row.id,
                summary=prompt,
            )
    return RecommendationView(incident_id=incident_id, prompt=prompt)


@router.post("/api/v1/incidents/{incident_id}/approve")
async def approve(
    incident_id: str,
    request: Request,
    principal: Principal = Depends(require("incidents:approve")),
) -> dict[str, str]:
    runtime = _runtime(request)
    async with runtime.sessions() as session:
        async with session.begin():
            row = await _incident_for(session, principal, incident_id)
            row.status = "approved"
            await append_audit(
                session,
                tenant_id=principal.tenant_id,
                actor=principal.subject,
                role=principal.role,
                action="human.approval",
                target_type="incident",
                target_id=row.id,
                summary="human approval recorded",
            )
    return {"incident_id": incident_id, "status": "approved"}


@router.post("/api/v1/incidents/{incident_id}/remediate")
async def remediate(
    incident_id: str,
    body: RemediationBody,
    request: Request,
    principal: Principal = Depends(require("incidents:remediate")),
) -> dict[str, str]:
    if body.action not in REMEDIATION_ACTIONS:
        raise HTTPException(status_code=400, detail="unsupported remediation action")
    runtime = _runtime(request)
    async with runtime.sessions() as session:
        async with session.begin():
            row = await _incident_for(session, principal, incident_id)
            row.status = "remediation_recorded"
            await append_audit(
                session,
                tenant_id=principal.tenant_id,
                actor=principal.subject,
                role=principal.role,
                action="remediation",
                target_type="incident",
                target_id=row.id,
                summary=f"remediation recorded: {body.action}",
            )
    return {"incident_id": incident_id, "status": "remediation_recorded", "action": body.action}


@router.get("/api/v1/audit", response_model=list[AuditRecordView])
async def list_audit(
    request: Request,
    principal: Principal = Depends(require("audit:read")),
) -> list[AuditRecordView]:
    from app.models.governance import AuditLog

    runtime = _runtime(request)
    async with runtime.sessions() as session:
        rows = (
            await session.scalars(
                select(AuditLog)
                .where(AuditLog.tenant_id == principal.tenant_id)
                .order_by(AuditLog.sequence)
            )
        ).all()
        views = [
            AuditRecordView(
                sequence=row.sequence,
                actor=row.actor,
                role=row.role,
                action=row.action,
                target_type=row.target_type,
                target_id=row.target_id,
                summary=row.summary,
                created_at=row.created_at,
                previous_hash=row.previous_hash,
                record_hash=row.record_hash,
            )
            for row in rows
        ]
    async with runtime.sessions() as session:
        async with session.begin():
            await append_audit(
                session,
                tenant_id=principal.tenant_id,
                actor=principal.subject,
                role=principal.role,
                action="api.read",
                target_type="audit_log",
                target_id="list",
                summary=f"listed {len(views)} audit records",
            )
    return views
