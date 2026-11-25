"""Ticket orchestration across the state machine, agents, and approval gate."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.soc_agents import (
    ResponseExecutionAgent,
    SocCopilotAgent,
    TriageInvestigationAgent,
)
from app.connectors.graph_remediation import GraphRemediationError
from app.governance.approval_policy import evaluate
from app.governance.audit import append_audit
from app.governance.guardrails import CanaryPolicyBlockedError, PiiMasker
from app.models.processing import CorrelatedIncident
from app.models.workflow import KnowledgeBaseEntry, Ticket, TicketStageEvent
from app.processing.engine import priority_for
from app.timeutil import format_graph, utcnow
from app.workflow.state_machine import (
    ASSIGN,
    INTAKE,
    RESOLVE,
    SOURCES,
    VERIFY_CLOSE,
    IllegalTransition,
    next_stage,
    sla_minutes_for,
    start_timer,
    ticket_due,
)

_COMMANDERS = frozenset({"INCIDENT_COMMANDER", "ADMIN"})
_ANALYSTS = frozenset({"SOC_ANALYST", "INCIDENT_COMMANDER", "ADMIN"})


class TicketFlowError(Exception):
    def __init__(
        self,
        status_code: int,
        detail: str,
        *,
        canary_block: dict[str, str] | None = None,
    ):
        self.status_code = status_code
        self.detail = detail
        self.canary_block = canary_block
        super().__init__(detail)


class TicketWorkflow:
    def __init__(self, responder: Any):
        self._responder = responder
        self._triage_agent = TriageInvestigationAgent()
        self._response = ResponseExecutionAgent()
        self._copilot = SocCopilotAgent()

    async def open_ticket(
        self,
        session: AsyncSession,
        *,
        tenant_id: str,
        actor: str,
        role: str,
        source: str,
        title: str,
        description: str,
        priority: str | None,
        risk_score: int | None,
        correlated_incident_id: str | None,
        user_principal_name: str | None,
        source_ip: str | None,
        device_id: str | None,
        graph_incident_id: str | None,
        masker: PiiMasker,
    ) -> Ticket:
        if source not in SOURCES:
            raise TicketFlowError(422, "unsupported intake source")
        resolved_priority, score = _priority(priority, risk_score)
        identity = await _identity_from_incident(
            session,
            tenant_id,
            correlated_incident_id,
            user_principal_name,
            source_ip,
            device_id,
        )
        now = utcnow()
        timer = start_timer(resolved_priority, INTAKE, now)
        ticket = Ticket(
            tenant_id=tenant_id,
            source=source,
            title=title.strip(),
            description=description.strip(),
            priority=resolved_priority,
            risk_score=score,
            stage=INTAKE,
            status="open",
            correlated_incident_id=correlated_incident_id,
            user_principal_name=identity[0],
            source_ip=identity[1],
            device_id=identity[2],
            graph_incident_id=graph_incident_id,
            approval_status="pending",
            opened_at=timer.entered_at,
            sla_due_at=ticket_due(resolved_priority, now),
            sla_minutes=sla_minutes_for(resolved_priority),
        )
        session.add(ticket)
        await session.flush()
        _add_stage(session, ticket, timer, actor, "intake accepted")
        await append_audit(
            session,
            tenant_id=tenant_id,
            actor=actor,
            role=role,
            action="api.read",
            target_type="ticket",
            target_id=ticket.id,
            summary=f"opened {source} ticket at {INTAKE}",
        )
        await masker.mask_telemetry(session, tenant_id, _mask_payload(ticket))
        return ticket

    async def advance(
        self,
        session: AsyncSession,
        ticket: Ticket,
        *,
        actor: str,
        role: str,
        masker: PiiMasker,
    ) -> Ticket:
        try:
            destination = next_stage(ticket.stage)
        except IllegalTransition as exc:
            raise TicketFlowError(409, str(exc)) from exc
        masked = await masker.mask_telemetry(session, ticket.tenant_id, _mask_payload(ticket))
        if destination == RESOLVE:
            await self._resolve(session, ticket, masked, actor, role, masker)
        elif destination == VERIFY_CLOSE:
            await self._verify_and_close(session, ticket, masked, masker)
        elif destination == ASSIGN:
            await self._assign(ticket)
        else:
            await self._triage(ticket, masked)
        timer = start_timer(ticket.priority, destination, utcnow())
        ticket.stage = destination
        _add_stage(session, ticket, timer, actor, f"entered {destination}")
        await append_audit(
            session,
            tenant_id=ticket.tenant_id,
            actor=actor,
            role=role,
            action="remediation" if destination == RESOLVE else "ai.recommendation",
            target_type="ticket",
            target_id=ticket.id,
            summary=_audit_summary(ticket, destination),
        )
        return ticket

    async def issue_token(
        self,
        session: AsyncSession,
        ticket: Ticket,
        *,
        actor: str,
        role: str,
    ) -> str:
        if role not in _COMMANDERS:
            raise TicketFlowError(403, "forbidden")
        if ticket.stage != ASSIGN or ticket.approval_mode != "commander_token":
            raise TicketFlowError(409, "this ticket is not waiting for a commander token")
        if ticket.token_hash and ticket.token_consumed == 0:
            raise TicketFlowError(409, "an approval token was already issued")
        token = secrets.token_urlsafe(32)
        ticket.token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        ticket.token_consumed = 0
        await append_audit(
            session,
            tenant_id=ticket.tenant_id,
            actor=actor,
            role=role,
            action="human.approval",
            target_type="ticket",
            target_id=ticket.id,
            summary="commander approval token issued",
        )
        return token

    async def approve(
        self,
        session: AsyncSession,
        ticket: Ticket,
        *,
        actor: str,
        role: str,
        approval_token: str | None,
        analyst_click: bool,
        policy_id: str | None,
    ) -> Ticket:
        if ticket.stage != ASSIGN:
            raise TicketFlowError(409, "approval is only accepted at ASSIGN")
        decision = evaluate(
            ticket.priority,
            ticket.runbook_id or "",
            approved=False,
            policy_id=policy_id,
        )
        if decision.execution_allowed and decision.mode in {"auto_execute", "preapproved_policy"}:
            raise TicketFlowError(409, "this ticket does not need an approval click")
        if ticket.approval_mode == "commander_token" or ticket.priority == "P1":
            if role not in _COMMANDERS:
                raise TicketFlowError(403, "forbidden")
            if not approval_token or not ticket.token_hash or ticket.token_consumed:
                raise TicketFlowError(403, "approval token rejected")
            digest = hashlib.sha256(approval_token.encode("utf-8")).hexdigest()
            if not hmac.compare_digest(digest, ticket.token_hash):
                raise TicketFlowError(403, "approval token rejected")
            ticket.token_consumed = 1
            ticket.approval_status = "approved"
        else:
            matched = decision.policy_id if policy_id else None
            if matched:
                ticket.policy_id = matched
                ticket.approval_mode = "preapproved_policy"
                ticket.approval_status = "approved"
            elif analyst_click and role in _ANALYSTS:
                ticket.approval_status = "approved"
                ticket.approval_mode = "analyst_click"
            else:
                raise TicketFlowError(403, "analyst approval required")
        await append_audit(
            session,
            tenant_id=ticket.tenant_id,
            actor=actor,
            role=role,
            action="human.approval",
            target_type="ticket",
            target_id=ticket.id,
            summary="human approval recorded",
        )
        return ticket

    async def query(
        self,
        session: AsyncSession,
        ticket: Ticket,
        *,
        actor: str,
        role: str,
        question: str,
        masker: PiiMasker,
    ) -> dict[str, Any]:
        masked = await masker.mask_telemetry(session, ticket.tenant_id, _mask_payload(ticket))
        result = self._copilot.answer(question, _copilot_context(ticket, masked))
        await append_audit(
            session,
            tenant_id=ticket.tenant_id,
            actor=actor,
            role=role,
            action="ai.recommendation",
            target_type="ticket",
            target_id=ticket.id,
            summary=result.output["answer"][:512],
        )
        return {
            "answer": result.output["answer"],
            "scoped": result.output["scoped"],
            "tools": [call.name for call in result.calls],
        }

    async def _triage(self, ticket: Ticket, masked: dict[str, Any]) -> None:
        context = {
            "user": masked.get("userPrincipalName") or "",
            "files": masked.get("documentTitle") or "",
            "device": masked.get("deviceId") or "",
        }
        result = self._triage_agent.investigate(masked, context)
        ticket.category = result.output["root_cause"]["category"]
        ticket.root_cause = result.output["root_cause"]
        ticket.runbook = result.output["runbook"]
        ticket.runbook_id = result.output["runbook"]["runbook_id"]

    async def _assign(self, ticket: Ticket) -> None:
        if not ticket.runbook_id:
            raise TicketFlowError(409, "triage has not produced a runbook")
        decision = evaluate(
            ticket.priority,
            ticket.runbook_id,
            approved=ticket.approval_status == "approved",
            policy_id=ticket.policy_id,
        )
        ticket.approval_mode = decision.mode
        ticket.assignee_role = decision.escalate_to
        ticket.policy_id = decision.policy_id
        if decision.execution_allowed:
            ticket.approval_status = "approved"
        else:
            ticket.approval_status = "pending"

    async def _resolve(
        self,
        session: AsyncSession,
        ticket: Ticket,
        masked: dict[str, Any],
        actor: str,
        role: str,
        masker: PiiMasker,
    ) -> None:
        decision = evaluate(
            ticket.priority,
            ticket.runbook_id or "",
            approved=ticket.approval_status == "approved",
            policy_id=ticket.policy_id,
        )
        if not decision.execution_allowed:
            raise TicketFlowError(409, decision.reason)
        actions = tuple((ticket.runbook or {}).get("actions") or [])
        calls = self._response.plan(masked, actions)
        evidence: list[dict[str, Any]] = []
        for call in calls:
            restored = await _restore_arguments(masker, session, ticket.tenant_id, call.arguments)
            _require_targets(call.name, restored)
            restored["ticketId"] = ticket.id
            restored["tenantId"] = ticket.tenant_id
            try:
                outcome = await self._responder.execute(call.name, restored)
            except CanaryPolicyBlockedError as exc:
                raise TicketFlowError(
                    409,
                    str(exc),
                    canary_block={
                        "tenant_id": ticket.tenant_id,
                        "actor": actor,
                        "role": role,
                        "action": "remediation.blocked",
                        "target_type": "canary_target",
                        "target_id": exc.action,
                        "summary": (
                            f"canary policy blocked {exc.action}; "
                            "target is outside TRINETRA_LIVE_CANARY_TARGETS"
                        ),
                    },
                ) from None
            except GraphRemediationError:
                raise TicketFlowError(409, "remediation was rejected") from None
            evidence.append({"action": call.name, "ok": bool(outcome.get("ok")), "state": _public_state(outcome)})
        ticket.evidence = evidence

    async def _verify_and_close(
        self,
        session: AsyncSession,
        ticket: Ticket,
        masked: dict[str, Any],
        masker: PiiMasker,
    ) -> None:
        actions = tuple((ticket.runbook or {}).get("actions") or [])
        executed = self._response.plan(masked, actions)
        checks = self._response.verification_calls(executed)
        verified: list[dict[str, Any]] = []
        for check in checks:
            resource = str(check.arguments["resource"])
            object_id = await masker.restore(
                session,
                ticket.tenant_id,
                str(check.arguments["id"]),
            )
            try:
                current = await self._responder.graph_get(
                    resource,
                    object_id,
                    tenant_id=ticket.tenant_id,
                    ticket_id=ticket.id,
                )
            except GraphRemediationError:
                raise TicketFlowError(409, "Graph GET verification failed") from None
            ok = _state_matches(resource, ticket.runbook_id or "", current)
            verified.append({"resource": resource, "ok": ok, "check": "GET"})
            if not ok:
                raise TicketFlowError(409, "Graph GET verification failed")
        context = _copilot_context(ticket, masked)
        closed = self._copilot.close(context)
        ticket.report = closed.output["report"]
        ticket.evidence = list(ticket.evidence or []) + verified
        ticket.status = "closed"
        ticket.closed_at = format_graph(utcnow())
        session.add(
            KnowledgeBaseEntry(
                tenant_id=ticket.tenant_id,
                ticket_id=ticket.id,
                title=closed.output["knowledge"]["title"][:200],
                body=closed.output["knowledge"]["body"],
                created_at=ticket.closed_at,
            )
        )


def _priority(priority: str | None, risk_score: int | None) -> tuple[str, int]:
    if priority is None and risk_score is None:
        raise TicketFlowError(422, "priority or risk_score is required")
    if risk_score is not None and not 0 <= risk_score <= 100:
        raise TicketFlowError(422, "risk_score must be between 0 and 100")
    if priority is not None:
        if priority not in {"P1", "P2", "P3"}:
            raise TicketFlowError(422, "priority must be P1, P2, or P3")
        score = risk_score if risk_score is not None else {"P1": 80, "P2": 60, "P3": 10}[priority]
        return priority, score
    assessment = priority_for(risk_score or 0)
    return assessment.priority, assessment.score


async def _identity_from_incident(
    session: AsyncSession,
    tenant_id: str,
    incident_id: str | None,
    upn: str | None,
    source_ip: str | None,
    device_id: str | None,
) -> tuple[str | None, str | None, str | None]:
    if incident_id is None:
        return upn, source_ip, device_id
    incident = await session.get(CorrelatedIncident, incident_id)
    if incident is None or incident.tenant_id != tenant_id:
        raise TicketFlowError(404, "incident not found")
    principals = list(incident.user_principal_names or [])
    ips = list(incident.source_ips or [])
    devices = list(incident.device_ids or [])
    return (
        upn or (principals[0] if principals else None),
        source_ip or (ips[0] if ips else None),
        device_id or (devices[0] if devices else None),
    )


def _add_stage(session: AsyncSession, ticket: Ticket, timer, actor: str, note: str) -> None:
    session.add(
        TicketStageEvent(
            ticket_id=ticket.id,
            tenant_id=ticket.tenant_id,
            stage=timer.stage,
            entered_at=timer.entered_at,
            sla_due_at=timer.sla_due_at,
            sla_minutes=timer.sla_minutes,
            actor=actor,
            note=note[:256],
        )
    )


def _mask_payload(ticket: Ticket) -> dict[str, Any]:
    return {
        "userPrincipalName": ticket.user_principal_name,
        "ClientIP": ticket.source_ip,
        "deviceId": ticket.device_id,
        "documentTitle": None,
        "narrative": ticket.description,
        "title": ticket.title,
        "priority": ticket.priority,
        "incidentId": ticket.graph_incident_id or ticket.id,
        "runbook_id": ticket.runbook_id,
    }


def _copilot_context(ticket: Ticket, masked: dict[str, Any]) -> dict[str, Any]:
    return {
        "category": ticket.category,
        "priority": ticket.priority,
        "stage": ticket.stage,
        "runbook_id": ticket.runbook_id,
        "user": masked.get("userPrincipalName"),
        "sourceIp": masked.get("ClientIP"),
        "narrative": masked.get("narrative"),
    }


def _audit_summary(ticket: Ticket, destination: str) -> str:
    if destination == RESOLVE:
        return f"executed runbook {ticket.runbook_id}"
    if destination == VERIFY_CLOSE:
        return f"verified and closed runbook {ticket.runbook_id}"
    return f"entered {destination} category {ticket.category or 'pending'}"


def _public_state(outcome: dict[str, Any]) -> dict[str, Any]:
    hidden = {"id", "userId", "deviceId", "incidentId"}
    return {key: value for key, value in outcome.items() if key not in hidden}


def _require_targets(action: str, arguments: dict[str, Any]) -> None:
    if action in {"revokeSignInSessions", "disableUser", "notifyUser"} and not arguments.get("userId"):
        raise TicketFlowError(422, "runbook requires a user principal")
    if action == "isolateDevice" and not arguments.get("deviceId"):
        raise TicketFlowError(422, "runbook requires a device id")
    if action in {"patchIncident", "enrichAlert"} and not arguments.get("incidentId"):
        raise TicketFlowError(422, "runbook requires an incident id")


async def _restore_arguments(
    masker: PiiMasker,
    session: AsyncSession,
    tenant_id: str,
    arguments: dict[str, Any],
) -> dict[str, Any]:
    restored: dict[str, Any] = {}
    for key, value in arguments.items():
        if isinstance(value, str):
            restored[key] = await masker.restore(session, tenant_id, value)
        else:
            restored[key] = value
    return restored


def _state_matches(resource: str, runbook_id: str, current: dict[str, Any]) -> bool:
    if resource == "user" and runbook_id == "user_notification":
        return current.get("notified") is True
    if resource == "user" and runbook_id == "disable_user":
        return current.get("accountEnabled") is False and current.get("sessionsRevoked") is True
    if resource == "user":
        return current.get("sessionsRevoked") is True
    if resource == "device":
        return current.get("isolationState") == "Isolated"
    if resource == "incident" and runbook_id == "alert_enrichment":
        return current.get("enriched") is True
    if resource == "incident" and runbook_id == "false_positive_closure":
        return current.get("status") == "resolved" and current.get("classification") == "falsePositive"
    if resource == "incident":
        return current.get("status") == "resolved"
    return False
