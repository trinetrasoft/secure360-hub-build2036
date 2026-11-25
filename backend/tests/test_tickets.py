"""State machine, agents, approval gates, and the mock responder."""

from __future__ import annotations

import json

import pytest
from sqlalchemy import select

from app.agents.soc_agents import (
    TRIAGE_TOOLS,
    TriageInvestigationAgent,
    anthropic_tools,
    bedrock_tools,
    classify_category,
    openai_tools,
    recommend_runbook,
)
from app.governance.approval_policy import evaluate
from app.models.governance import AuditLog
from app.workflow.state_machine import (
    AI_TRIAGE,
    ASSIGN,
    INTAKE,
    INVESTIGATE,
    RESOLVE,
    STAGES,
    VERIFY_CLOSE,
    IllegalTransition,
    next_stage,
    stage_budget_minutes,
)
from tests.conftest import TENANT_ID

OTHER = "33333333-3333-3333-3333-333333333333"
EMAIL = "ada.lovelace@contoso.com"


def _headers(role: str, tenant: str = TENANT_ID, subject: str = "analyst-1") -> dict[str, str]:
    return {
        "X-Trinetra-Tenant": tenant,
        "X-Trinetra-Role": role,
        "X-Trinetra-Subject": subject,
    }


def test_stages_move_one_step_and_carry_a_timer():
    assert STAGES == (
        "1. INTAKE",
        "2. AI TRIAGE",
        "3. INVESTIGATE",
        "4. ASSIGN",
        "5. RESOLVE",
        "6. VERIFY & CLOSE",
    )
    assert next_stage(INTAKE) == AI_TRIAGE
    assert next_stage(RESOLVE) == VERIFY_CLOSE
    with pytest.raises(IllegalTransition):
        next_stage(VERIFY_CLOSE)
    assert stage_budget_minutes("P1", INTAKE) >= 1
    assert stage_budget_minutes("P1", RESOLVE) >= stage_budget_minutes("P1", INTAKE)


def test_tool_schemas_match_openai_anthropic_and_bedrock():
    openai = openai_tools(TRIAGE_TOOLS)
    anthropic = anthropic_tools(TRIAGE_TOOLS)
    bedrock = bedrock_tools(TRIAGE_TOOLS)
    assert openai[0]["type"] == "function"
    assert openai[0]["function"]["name"] == "classify_category"
    assert anthropic[0]["input_schema"]["required"] == ["narrative"]
    assert bedrock[0]["toolSpec"]["inputSchema"]["json"]["type"] == "object"
    narrative = "Impossible travel for [USER_01] from [IP_01]"
    calls = TriageInvestigationAgent().plan(
        {
            "narrative": narrative,
            "userPrincipalName": "[USER_01]",
            "documentTitle": "[DOC_01]",
            "deviceId": "device-1",
        }
    )
    assert EMAIL not in json.dumps([call.arguments for call in calls])
    assert classify_category("user consented to a malicious oauth app")[0] == "Malicious OAuth App"
    assert classify_category("DLP exfiltration of payroll")[0] == "DLP Exfiltration"
    assert classify_category("phishing link in mailbox")[0] == "Phishing"
    assert recommend_runbook("Impossible Travel", "P1", "impossible travel").runbook_id == "revoke_sessions"


def test_approval_policy_blocks_p1_and_auto_runs_low_risk_p3():
    p1 = evaluate("P1", "revoke_sessions", approved=False)
    assert p1.execution_allowed is False
    assert p1.escalate_to == "INCIDENT_COMMANDER"
    assert evaluate("P1", "alert_enrichment", approved=True).execution_allowed is True
    p2 = evaluate("P2", "disable_user", approved=False)
    assert p2.mode == "analyst_click"
    assert p2.execution_allowed is False
    policy = evaluate("P2", "user_notification", approved=False)
    assert policy.mode == "preapproved_policy"
    assert policy.execution_allowed is True
    p3 = evaluate("P3", "alert_enrichment", approved=False)
    assert p3.mode == "auto_execute"
    assert p3.execution_allowed is True
    assert evaluate("P3", "disable_user", approved=False).execution_allowed is False


async def _open(client, payload: dict, role: str = "SOC_ANALYST") -> dict:
    response = await client.post("/api/v1/tickets", headers=_headers(role), json=payload)
    assert response.status_code == 200, response.text
    return response.json()


async def _advance(client, ticket_id: str, role: str = "SOC_ANALYST", subject: str = "analyst-1"):
    return await client.post(
        f"/api/v1/tickets/{ticket_id}/advance",
        headers=_headers(role, subject=subject),
    )


@pytest.mark.asyncio
async def test_p3_low_risk_ticket_auto_closes_after_graph_get(api, runtime):
    client, _runtime = api
    opened = await _open(
        client,
        {
            "source": "teams_bot",
            "title": "Noisy sign-in",
            "description": "Routine alert enrichment for a repeated low-risk sign-in.",
            "priority": "P3",
            "risk_score": 10,
        },
    )
    assert opened["stage"] == INTAKE
    assert opened["sla_minutes"] == 24 * 60
    assert opened["stages"][0]["entered_at"] < opened["stages"][0]["sla_due_at"]
    ticket_id = opened["id"]
    body = opened
    for _ in range(5):
        response = await _advance(client, ticket_id)
        assert response.status_code == 200, response.text
        body = response.json()
    assert body["stage"] == VERIFY_CLOSE
    assert body["status"] == "closed"
    assert body["runbook_id"] == "alert_enrichment"
    assert any(item.get("check") == "GET" and item.get("ok") is True for item in body["evidence"])
    assert ("GET", {"resource": "incident", "id": ticket_id}) in runtime.responder.calls
    blocked = await _advance(client, ticket_id)
    assert blocked.status_code == 409
    report = await client.get(
        f"/api/v1/tickets/{ticket_id}/report",
        headers=_headers("AUDITOR", subject="auditor-1"),
    )
    assert report.status_code == 200
    assert report.json()["knowledge"]["title"]
    assert "ada.lovelace@" not in report.text


@pytest.mark.asyncio
async def test_p1_requires_commander_token_before_execution(api, runtime):
    client, _runtime = api
    opened = await _open(
        client,
        {
            "source": "m365_detection",
            "title": "Impossible travel",
            "description": f"Impossible travel for {EMAIL} from 203.0.113.50",
            "priority": "P1",
            "user_principal_name": EMAIL,
            "source_ip": "203.0.113.50",
        },
    )
    ticket_id = opened["id"]
    for expected in (AI_TRIAGE, INVESTIGATE, ASSIGN):
        response = await _advance(client, ticket_id)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["stage"] == expected
    assert body["approval_mode"] == "commander_token"
    assert body["assignee_role"] == "INCIDENT_COMMANDER"
    assert body["approval_status"] == "pending"
    blocked = await _advance(client, ticket_id)
    assert blocked.status_code == 409
    assert blocked.json()["detail"].startswith("P1")
    still = await client.get(f"/api/v1/tickets/{ticket_id}", headers=_headers("SOC_ANALYST"))
    assert still.json()["stage"] == ASSIGN
    analyst = await client.post(
        f"/api/v1/tickets/{ticket_id}/approve",
        headers=_headers("SOC_ANALYST"),
        json={"approval_token": "nope"},
    )
    assert analyst.status_code == 403
    issued = await client.post(
        f"/api/v1/tickets/{ticket_id}/approval-token",
        headers=_headers("INCIDENT_COMMANDER", subject="commander-1"),
    )
    assert issued.status_code == 200
    token = issued.json()["approval_token"]
    rejected = await client.post(
        f"/api/v1/tickets/{ticket_id}/approve",
        headers=_headers("INCIDENT_COMMANDER", subject="commander-1"),
        json={"approval_token": "wrong-token"},
    )
    assert rejected.status_code == 403
    approved = await client.post(
        f"/api/v1/tickets/{ticket_id}/approve",
        headers=_headers("INCIDENT_COMMANDER", subject="commander-1"),
        json={"approval_token": token},
    )
    assert approved.status_code == 200
    reused = await client.post(
        f"/api/v1/tickets/{ticket_id}/approve",
        headers=_headers("INCIDENT_COMMANDER", subject="commander-1"),
        json={"approval_token": token},
    )
    assert reused.status_code == 403
    resolved = await _advance(client, ticket_id, role="INCIDENT_COMMANDER", subject="commander-1")
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["stage"] == RESOLVE
    assert EMAIL not in json.dumps(resolved.json()["evidence"])
    assert any(
        call[0] == "revokeSignInSessions" and call[1]["userId"] == EMAIL
        for call in runtime.responder.calls
    )
    closed = await _advance(client, ticket_id, role="INCIDENT_COMMANDER", subject="commander-1")
    assert closed.status_code == 200, closed.text
    assert closed.json()["stage"] == VERIFY_CLOSE
    question = await client.post(
        f"/api/v1/tickets/{ticket_id}/query",
        headers=_headers("SOC_ANALYST"),
        json={"question": "What is the category?"},
    )
    assert question.status_code == 200
    assert question.json()["answer"] == "Category is Impossible Travel."
    outside = await client.post(
        f"/api/v1/tickets/{ticket_id}/query",
        headers=_headers("SOC_ANALYST"),
        json={"question": "What did grace@fabrikam.com do in another tenant?"},
    )
    assert outside.json()["scoped"] is False
    assert "grace@fabrikam.com" not in outside.text
    auditor = await client.get(
        f"/api/v1/tickets/{ticket_id}",
        headers=_headers("AUDITOR", subject="auditor-1"),
    )
    assert auditor.status_code == 200
    assert EMAIL not in auditor.text
    assert "203.0.113.50" not in auditor.text
    async with runtime.sessions() as session:
        rows = (await session.scalars(select(AuditLog).where(AuditLog.tenant_id == TENANT_ID))).all()
    assert rows
    assert all(EMAIL not in row.summary for row in rows)


@pytest.mark.asyncio
async def test_p2_policy_match_and_analyst_click(api):
    client, _runtime = api
    notified = await _open(
        client,
        {
            "source": "email_report",
            "title": "Notice",
            "description": "Please notify the user about a suspicious inbox rule.",
            "priority": "P2",
            "user_principal_name": EMAIL,
        },
    )
    ticket_id = notified["id"]
    for _ in range(4):
        response = await _advance(client, ticket_id)
        assert response.status_code == 200, response.text
    assert response.json()["stage"] == RESOLVE
    assert response.json()["runbook_id"] == "user_notification"
    assert response.json()["policy_id"] == "preapproved-user-notification"

    phishing = await _open(
        client,
        {
            "source": "employee_portal",
            "title": "Reported phish",
            "description": "Employee submitted a phishing message.",
            "priority": "P2",
            "user_principal_name": EMAIL,
        },
    )
    phishing_id = phishing["id"]
    for expected in (AI_TRIAGE, INVESTIGATE, ASSIGN):
        response = await _advance(client, phishing_id)
        assert response.status_code == 200, response.text
        assert response.json()["stage"] == expected
    blocked = await _advance(client, phishing_id)
    assert blocked.status_code == 409
    clicked = await client.post(
        f"/api/v1/tickets/{phishing_id}/approve",
        headers=_headers("SOC_ANALYST"),
        json={"analyst_click": True},
    )
    assert clicked.status_code == 200
    resolved = await _advance(client, phishing_id)
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["runbook_id"] == "disable_user"
    assert EMAIL not in json.dumps(resolved.json()["evidence"])


@pytest.mark.asyncio
async def test_intake_sources_and_tenant_isolation(api):
    client, _runtime = api
    for source in ("m365_detection", "employee_portal", "email_report", "teams_bot"):
        opened = await _open(
            client,
            {
                "source": source,
                "title": source,
                "description": "Routine alert enrichment.",
                "priority": "P3",
            },
        )
        assert opened["source"] == source
        assert len(opened["stages"]) == 1
    rejected = await client.post(
        "/api/v1/tickets",
        headers=_headers("SOC_ANALYST"),
        json={"source": "sms", "title": "nope", "description": "nope", "priority": "P3"},
    )
    assert rejected.status_code == 422
    hidden = await client.get(
        f"/api/v1/tickets/{opened['id']}",
        headers=_headers("SOC_ANALYST", tenant=OTHER, subject="other-1"),
    )
    assert hidden.status_code == 404
    auditor = await client.get(
        f"/api/v1/tickets/{opened['id']}",
        headers=_headers("AUDITOR", subject="auditor-1"),
    )
    assert auditor.status_code == 200
    assert auditor.json()["user_principal_name"] is None
