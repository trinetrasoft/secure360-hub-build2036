"""Correlation run and incident reads."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select

from app.governance.audit import append_audit
from app.governance.guardrails import Principal, require, same_tenant
from app.models.processing import CorrelatedIncident, IncidentSignal
from app.processing.engine import ProcessingEngine
from app.runtime import Runtime
from app.schemas.operations import IncidentView, ProcessView

router = APIRouter()
_engine = ProcessingEngine()


def _runtime(request: Request) -> Runtime:
    return request.app.state.runtime


def _incident_view(row: CorrelatedIncident, signal_count: int, *, sensitive: bool) -> IncidentView:
    return IncidentView(
        id=row.id,
        tenant_id=row.tenant_id,
        risk_score=row.risk_score,
        priority=row.priority,
        priority_label=row.priority_label,
        sla_minutes=row.sla_minutes,
        sla_due_at=row.sla_due_at,
        status=row.status,
        window_start=row.window_start,
        window_end=row.window_end,
        signal_count=signal_count,
        user_principal_names=list(row.user_principal_names) if sensitive else [],
        source_ips=list(row.source_ips) if sensitive else [],
        device_ids=list(row.device_ids) if sensitive else [],
    )


async def _load_incidents(runtime: Runtime, tenant_id: str, *, sensitive: bool) -> list[IncidentView]:
    async with runtime.sessions() as session:
        rows = (
            await session.scalars(
                select(CorrelatedIncident)
                .where(CorrelatedIncident.tenant_id == tenant_id)
                .order_by(CorrelatedIncident.opened_at)
            )
        ).all()
        views: list[IncidentView] = []
        for row in rows:
            count = await session.scalar(
                select(func.count())
                .select_from(IncidentSignal)
                .where(IncidentSignal.incident_id == row.id)
            )
            views.append(_incident_view(row, int(count or 0), sensitive=sensitive))
        return views


@router.post(
    "/api/v1/processing/tenants/{tenant_id}/run",
    response_model=ProcessView,
)
async def run_processing(
    tenant_id: str,
    request: Request,
    principal: Principal = Depends(require("processing:run")),
) -> ProcessView:
    same_tenant(principal, tenant_id)
    summary = await _engine.process_tenant(_runtime(request).sessions, tenant_id)
    sensitive = principal.allows("incidents:read_sensitive")
    stored = {item.id: item for item in await _load_incidents(_runtime(request), tenant_id, sensitive=sensitive)}
    incidents = []
    for item in summary.incidents:
        view = stored.get(item.id)
        if view is None:
            continue
        incidents.append(view.model_copy(update={"signal_count": item.signal_count}))
    return ProcessView(
        tenant_id=summary.tenant_id,
        considered=summary.considered,
        duplicates=summary.duplicates,
        incidents=incidents,
    )


@router.get("/api/v1/incidents", response_model=list[IncidentView])
async def list_incidents(
    request: Request,
    principal: Principal = Depends(require("incidents:read")),
) -> list[IncidentView]:
    runtime = _runtime(request)
    views = await _load_incidents(
        runtime,
        principal.tenant_id,
        sensitive=principal.allows("incidents:read_sensitive"),
    )
    async with runtime.sessions() as session:
        async with session.begin():
            await append_audit(
                session,
                tenant_id=principal.tenant_id,
                actor=principal.subject,
                role=principal.role,
                action="api.read",
                target_type="incident",
                target_id="list",
                summary=f"listed {len(views)} incidents",
            )
    return views
