"""Operator endpoints for polling, subscriptions, checkpoints, and stored events."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.connectors.m365_client import M365ClientError
from app.governance.audit import append_audit
from app.governance.guardrails import Principal, require, same_tenant
from app.ingestion.scheduler import IngestionScheduler
from app.ingestion.store import list_checkpoints, list_events
from app.runtime import Runtime
from app.schemas.security import CanonicalSecurityEventView, CheckpointView, PollSummary
from app.workflow.executor import connector_token_health

router = APIRouter()


def _runtime(request: Request) -> Runtime:
    return request.app.state.runtime


def _pipeline(runtime: Runtime):
    if runtime.pipeline is None:
        raise HTTPException(status_code=503, detail="ingestion pipeline is not ready")
    return runtime.pipeline


@router.get("/api/v1/health")
async def health(request: Request) -> dict[str, object]:
    runtime = _runtime(request)
    connectors = await connector_token_health(runtime.settings, runtime.secrets, runtime.tokens)
    status = "ok"
    if any(item["status"] == "error" for item in connectors.values()):
        status = "degraded"
    return {
        "status": status,
        "service": "trinetra-m365-ingestion",
        "execution_mode": runtime.settings.execution_mode,
        "last_poll_at": runtime.last_poll_at,
        "connectors": connectors,
    }


@router.post("/api/v1/ingestion/sync-now")
async def sync_now(
    request: Request,
    principal: Principal = Depends(require("ingestion:run")),
) -> dict[str, object]:
    """Poll the caller's tenant from the stored checkpoint and open new tickets."""
    runtime = _runtime(request)
    _pipeline(runtime)
    scheduler = runtime.scheduler or IngestionScheduler(runtime)
    try:
        return await scheduler.sync_tenant(principal.tenant_id)
    except M365ClientError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.post("/api/v1/ingestion/tenants/{tenant_id}/poll", response_model=PollSummary)
async def poll_tenant(
    tenant_id: str,
    request: Request,
    principal: Principal = Depends(require("ingestion:run")),
) -> PollSummary:
    same_tenant(principal, tenant_id)
    return await _pipeline(_runtime(request)).poll_tenant(tenant_id)


@router.post("/api/v1/ingestion/tenants/{tenant_id}/subscriptions/start")
async def start_subscriptions(
    tenant_id: str,
    request: Request,
    principal: Principal = Depends(require("ingestion:run")),
) -> dict[str, object]:
    same_tenant(principal, tenant_id)
    try:
        started = await _pipeline(_runtime(request)).start_subscriptions(tenant_id)
    except M365ClientError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    return {"tenant_id": tenant_id, "subscriptions": started}


@router.get(
    "/api/v1/ingestion/tenants/{tenant_id}/checkpoints",
    response_model=list[CheckpointView],
)
async def checkpoints(
    tenant_id: str,
    request: Request,
    principal: Principal = Depends(require("events:read")),
) -> list[CheckpointView]:
    same_tenant(principal, tenant_id)
    runtime = _runtime(request)
    rows = await list_checkpoints(runtime.sessions, tenant_id)
    async with runtime.sessions() as session:
        async with session.begin():
            await append_audit(
                session,
                tenant_id=principal.tenant_id,
                actor=principal.subject,
                role=principal.role,
                action="api.read",
                target_type="checkpoint",
                target_id=tenant_id,
                summary=f"listed {len(rows)} checkpoints",
            )
    return rows


@router.get("/api/v1/events", response_model=list[CanonicalSecurityEventView])
async def events(
    request: Request,
    tenant_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    principal: Principal = Depends(require("events:read")),
) -> list[CanonicalSecurityEventView]:
    if tenant_id is not None:
        same_tenant(principal, tenant_id)
    runtime = _runtime(request)
    rows = await list_events(runtime.sessions, tenant_id=principal.tenant_id, limit=limit)
    if not principal.allows("incidents:read_sensitive"):
        rows = [
            row.model_copy(update={"actor": None, "device": None, "resource": None})
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
                target_type="event",
                target_id="list",
                summary=f"listed {len(rows)} events",
            )
    return rows
