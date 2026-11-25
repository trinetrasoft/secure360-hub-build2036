"""Ticket lifecycle routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.governance.audit import append_audit
from app.governance.guardrails import PiiMasker, Principal, VaultKeyError, require
from app.models.governance import AuditLog
from app.models.workflow import KnowledgeBaseEntry, Ticket, TicketStageEvent
from app.runtime import Runtime
from app.workflow.executor import record_canary_block
from app.workflow.service import TicketFlowError, TicketWorkflow
from app.workflow.state_machine import VERIFY_CLOSE

router = APIRouter()


class TicketCreate(BaseModel):
    source: str
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=4000)
    priority: str | None = None
    risk_score: int | None = None
    correlated_incident_id: str | None = None
    user_principal_name: str | None = None
    source_ip: str | None = None
    device_id: str | None = None
    graph_incident_id: str | None = None


class ApprovalBody(BaseModel):
    approval_token: str | None = None
    analyst_click: bool = False
    policy_id: str | None = None


class QueryBody(BaseModel):
    question: str = Field(min_length=1, max_length=500)


class StageView(BaseModel):
    stage: str
    entered_at: str
    sla_due_at: str
    sla_minutes: int
    actor: str


class TicketView(BaseModel):
    id: str
    tenant_id: str
    source: str
    title: str
    description: str
    priority: str
    risk_score: int
    stage: str
    status: str
    category: str | None
    runbook_id: str | None
    approval_mode: str | None
    approval_status: str
    assignee_role: str | None
    policy_id: str | None
    sla_due_at: str
    sla_minutes: int
    opened_at: str
    closed_at: str | None
    user_principal_name: str | None = None
    source_ip: str | None = None
    device_id: str | None = None
    stages: list[StageView] = Field(default_factory=list)
    evidence: list[dict] = Field(default_factory=list)
    root_cause: dict | None = None
    runbook: dict | None = None
    entity_tags: list[str] = Field(default_factory=list)


def _runtime(request: Request) -> Runtime:
    return request.app.state.runtime


def _workflow(runtime: Runtime) -> TicketWorkflow:
    return TicketWorkflow(runtime.responder)


def _masker(runtime: Runtime) -> PiiMasker:
    if runtime.settings.vault_key is None:
        raise HTTPException(status_code=503, detail="vault key is not configured")
    try:
        return PiiMasker(runtime.settings.vault_key.get_secret_value())
    except VaultKeyError:
        raise HTTPException(status_code=503, detail="vault key is not configured") from None


def _http(exc: TicketFlowError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.detail)


async def _ticket(session: AsyncSession, principal: Principal, ticket_id: str) -> Ticket:
    row = await session.get(Ticket, ticket_id)
    if row is None or row.tenant_id != principal.tenant_id:
        raise HTTPException(status_code=404, detail="ticket not found")
    return row


async def _stages(session: AsyncSession, ticket_id: str) -> list[TicketStageEvent]:
    rows = (
        await session.scalars(
            select(TicketStageEvent)
            .where(TicketStageEvent.ticket_id == ticket_id)
            .order_by(TicketStageEvent.entered_at)
        )
    ).all()
    return list(rows)


async def _view(
    session: AsyncSession,
    ticket: Ticket,
    principal: Principal,
    masker: PiiMasker,
) -> TicketView:
    sensitive = principal.allows("incidents:read_sensitive")
    masked_identity = await masker.mask_telemetry(
        session,
        principal.tenant_id,
        {
            "userPrincipalName": ticket.user_principal_name,
            "ClientIP": ticket.source_ip,
        },
    )
    entity_tags = [
        value
        for key in ("userPrincipalName", "ClientIP")
        if isinstance(value := masked_identity.get(key), str) and value.startswith("[")
    ]
    title = ticket.title
    description = ticket.description
    upn = ticket.user_principal_name
    source_ip = ticket.source_ip
    device_id = ticket.device_id
    if not sensitive:
        masked = await masker.mask_telemetry(
            session,
            principal.tenant_id,
            {
                "title": title,
                "narrative": description,
                "userPrincipalName": upn,
                "ClientIP": source_ip,
            },
        )
        title = str(masked["title"])
        description = str(masked["narrative"])
        upn = None
        source_ip = None
        device_id = None
    events = await _stages(session, ticket.id)
    return TicketView(
        id=ticket.id,
        tenant_id=ticket.tenant_id,
        source=ticket.source,
        title=title,
        description=description,
        priority=ticket.priority,
        risk_score=ticket.risk_score,
        stage=ticket.stage,
        status=ticket.status,
        category=ticket.category,
        runbook_id=ticket.runbook_id,
        approval_mode=ticket.approval_mode,
        approval_status=ticket.approval_status,
        assignee_role=ticket.assignee_role,
        policy_id=ticket.policy_id,
        sla_due_at=ticket.sla_due_at,
        sla_minutes=ticket.sla_minutes,
        opened_at=ticket.opened_at,
        closed_at=ticket.closed_at,
        user_principal_name=upn,
        source_ip=source_ip,
        device_id=device_id,
        stages=[
            StageView(
                stage=event.stage,
                entered_at=event.entered_at,
                sla_due_at=event.sla_due_at,
                sla_minutes=event.sla_minutes,
                actor=event.actor,
            )
            for event in events
        ],
        evidence=list(ticket.evidence or []),
        root_cause=ticket.root_cause,
        runbook=ticket.runbook,
        entity_tags=entity_tags,
    )


@router.post("/api/v1/tickets", response_model=TicketView)
async def create_ticket(
    body: TicketCreate,
    request: Request,
    principal: Principal = Depends(require("tickets:intake")),
) -> TicketView:
    runtime = _runtime(request)
    masker = _masker(runtime)
    async with runtime.sessions() as session:
        async with session.begin():
            try:
                ticket = await _workflow(runtime).open_ticket(
                    session,
                    tenant_id=principal.tenant_id,
                    actor=principal.subject,
                    role=principal.role,
                    source=body.source,
                    title=body.title,
                    description=body.description,
                    priority=body.priority,
                    risk_score=body.risk_score,
                    correlated_incident_id=body.correlated_incident_id,
                    user_principal_name=body.user_principal_name,
                    source_ip=body.source_ip,
                    device_id=body.device_id,
                    graph_incident_id=body.graph_incident_id,
                    masker=masker,
                )
            except TicketFlowError as exc:
                raise _http(exc) from None
            return await _view(session, ticket, principal, masker)


@router.get("/api/v1/tickets", response_model=list[TicketView])
async def list_tickets(
    request: Request,
    principal: Principal = Depends(require("tickets:read")),
) -> list[TicketView]:
    runtime = _runtime(request)
    masker = _masker(runtime)
    async with runtime.sessions() as session:
        rows = (
            await session.scalars(
                select(Ticket)
                .where(Ticket.tenant_id == principal.tenant_id)
                .order_by(Ticket.opened_at)
            )
        ).all()
        views = [await _view(session, row, principal, masker) for row in rows]
    async with runtime.sessions() as session:
        async with session.begin():
            await append_audit(
                session,
                tenant_id=principal.tenant_id,
                actor=principal.subject,
                role=principal.role,
                action="api.read",
                target_type="ticket",
                target_id="list",
                summary=f"listed {len(views)} tickets",
            )
    return views


@router.get("/api/v1/tickets/{ticket_id}", response_model=TicketView)
async def get_ticket(
    ticket_id: str,
    request: Request,
    principal: Principal = Depends(require("tickets:read")),
) -> TicketView:
    runtime = _runtime(request)
    masker = _masker(runtime)
    async with runtime.sessions() as session:
        ticket = await _ticket(session, principal, ticket_id)
        view = await _view(session, ticket, principal, masker)
    async with runtime.sessions() as session:
        async with session.begin():
            await append_audit(
                session,
                tenant_id=principal.tenant_id,
                actor=principal.subject,
                role=principal.role,
                action="api.read",
                target_type="ticket",
                target_id=ticket_id,
                summary=f"read ticket {ticket_id}",
            )
    return view


@router.post("/api/v1/tickets/{ticket_id}/advance", response_model=TicketView)
async def advance_ticket(
    ticket_id: str,
    request: Request,
    principal: Principal = Depends(require("tickets:advance")),
) -> TicketView:
    runtime = _runtime(request)
    masker = _masker(runtime)
    try:
        async with runtime.sessions() as session:
            async with session.begin():
                ticket = await _ticket(session, principal, ticket_id)
                await _workflow(runtime).advance(
                    session,
                    ticket,
                    actor=principal.subject,
                    role=principal.role,
                    masker=masker,
                )
                return await _view(session, ticket, principal, masker)
    except TicketFlowError as exc:
        if exc.canary_block:
            await record_canary_block(runtime.sessions, exc.canary_block)
        raise _http(exc) from None


@router.post("/api/v1/tickets/{ticket_id}/approval-token")
async def issue_approval_token(
    ticket_id: str,
    request: Request,
    principal: Principal = Depends(require("tickets:approve")),
) -> dict[str, str]:
    runtime = _runtime(request)
    async with runtime.sessions() as session:
        async with session.begin():
            ticket = await _ticket(session, principal, ticket_id)
            try:
                token = await _workflow(runtime).issue_token(
                    session,
                    ticket,
                    actor=principal.subject,
                    role=principal.role,
                )
            except TicketFlowError as exc:
                raise _http(exc) from None
    return {"ticket_id": ticket_id, "approval_token": token}


@router.post("/api/v1/tickets/{ticket_id}/approve", response_model=TicketView)
async def approve_ticket(
    ticket_id: str,
    body: ApprovalBody,
    request: Request,
    principal: Principal = Depends(require("tickets:approve")),
) -> TicketView:
    runtime = _runtime(request)
    masker = _masker(runtime)
    async with runtime.sessions() as session:
        async with session.begin():
            ticket = await _ticket(session, principal, ticket_id)
            try:
                await _workflow(runtime).approve(
                    session,
                    ticket,
                    actor=principal.subject,
                    role=principal.role,
                    approval_token=body.approval_token,
                    analyst_click=body.analyst_click,
                    policy_id=body.policy_id,
                )
            except TicketFlowError as exc:
                raise _http(exc) from None
            return await _view(session, ticket, principal, masker)


@router.post("/api/v1/tickets/{ticket_id}/query")
async def query_ticket(
    ticket_id: str,
    body: QueryBody,
    request: Request,
    principal: Principal = Depends(require("tickets:query")),
) -> dict[str, object]:
    runtime = _runtime(request)
    masker = _masker(runtime)
    async with runtime.sessions() as session:
        async with session.begin():
            ticket = await _ticket(session, principal, ticket_id)
            try:
                return await _workflow(runtime).query(
                    session,
                    ticket,
                    actor=principal.subject,
                    role=principal.role,
                    question=body.question,
                    masker=masker,
                )
            except TicketFlowError as exc:
                raise _http(exc) from None


@router.get("/api/v1/tickets/{ticket_id}/report")
async def ticket_report(
    ticket_id: str,
    request: Request,
    principal: Principal = Depends(require("tickets:report")),
) -> dict[str, object]:
    runtime = _runtime(request)
    async with runtime.sessions() as session:
        ticket = await _ticket(session, principal, ticket_id)
        if ticket.stage != VERIFY_CLOSE or ticket.report is None:
            raise HTTPException(status_code=409, detail="ticket is not closed")
        knowledge = await session.scalar(
            select(KnowledgeBaseEntry).where(
                KnowledgeBaseEntry.ticket_id == ticket.id,
                KnowledgeBaseEntry.tenant_id == principal.tenant_id,
            )
        )
        payload = {
            "ticket_id": ticket.id,
            "report": ticket.report,
            "knowledge": None
            if knowledge is None
            else {"title": knowledge.title, "body": knowledge.body},
        }
    async with runtime.sessions() as session:
        async with session.begin():
            await append_audit(
                session,
                tenant_id=principal.tenant_id,
                actor=principal.subject,
                role=principal.role,
                action="api.read",
                target_type="ticket_report",
                target_id=ticket_id,
                summary="read closure report",
            )
    return payload


@router.get("/api/v1/tickets/{ticket_id}/timeline")
async def ticket_timeline(
    ticket_id: str,
    request: Request,
    principal: Principal = Depends(require("tickets:read")),
) -> dict[str, object]:
    runtime = _runtime(request)
    async with runtime.sessions() as session:
        ticket = await _ticket(session, principal, ticket_id)
        stages = await _stages(session, ticket.id)
        audits = (
            await session.scalars(
                select(AuditLog)
                .where(
                    AuditLog.tenant_id == principal.tenant_id,
                    AuditLog.target_id == ticket.id,
                )
                .order_by(AuditLog.sequence)
            )
        ).all()
    return {
        "ticket_id": ticket.id,
        "stages": [
            {
                "stage": event.stage,
                "entered_at": event.entered_at,
                "sla_due_at": event.sla_due_at,
                "actor": event.actor,
            }
            for event in stages
        ],
        "audit": [
            {
                "sequence": row.sequence,
                "action": row.action,
                "summary": row.summary,
                "created_at": row.created_at,
                "previous_hash": row.previous_hash,
                "record_hash": row.record_hash,
            }
            for row in audits
        ],
    }


@router.get("/api/v1/knowledge")
async def list_knowledge(
    request: Request,
    principal: Principal = Depends(require("tickets:read")),
) -> list[dict[str, str]]:
    runtime = _runtime(request)
    async with runtime.sessions() as session:
        rows = (
            await session.scalars(
                select(KnowledgeBaseEntry)
                .where(KnowledgeBaseEntry.tenant_id == principal.tenant_id)
                .order_by(KnowledgeBaseEntry.created_at)
            )
        ).all()
    return [
        {
            "id": row.id,
            "ticket_id": row.ticket_id,
            "title": row.title,
            "body": row.body,
            "created_at": row.created_at,
        }
        for row in rows
    ]
