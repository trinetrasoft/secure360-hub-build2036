"""SOC agents that plan work as SDK-shaped tool calls.

Inputs are already masked. The planners are deterministic so a ticket can be
tested without an external model. The same tool list is exported in the
OpenAI, Anthropic, and Bedrock Converse shapes.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

_EMAIL = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")
_IPV4 = re.compile(
    r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b"
)

CATEGORIES = (
    "Impossible Travel",
    "Malicious OAuth App",
    "DLP Exfiltration",
    "Phishing",
    "Unclassified",
)

RUNBOOK_ACTIONS: dict[str, tuple[str, ...]] = {
    "revoke_sessions": ("revokeSignInSessions", "patchIncident"),
    "disable_user": ("disableUser", "revokeSignInSessions", "patchIncident"),
    "isolate_device": ("isolateDevice", "patchIncident"),
    "alert_enrichment": ("enrichAlert",),
    "user_notification": ("notifyUser",),
    "false_positive_closure": ("patchIncident",),
}


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]


@dataclass(frozen=True)
class ToolCall:
    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True)
class RootCauseSummary:
    category: str
    confidence: float
    narrative: str
    evidence: tuple[str, ...]


@dataclass(frozen=True)
class RecommendedRunbook:
    runbook_id: str
    actions: tuple[str, ...]
    rationale: str


@dataclass
class AgentResult:
    calls: list[ToolCall] = field(default_factory=list)
    output: dict[str, Any] = field(default_factory=dict)


def _object_schema(properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": False,
    }


TRIAGE_TOOLS: tuple[ToolSpec, ...] = (
    ToolSpec(
        name="classify_category",
        description="Classify one masked incident narrative into a SOC category.",
        parameters=_object_schema(
            {"narrative": {"type": "string"}},
            ["narrative"],
        ),
    ),
    ToolSpec(
        name="query_user_context",
        description="Read correlated user context already stored for this incident.",
        parameters=_object_schema({"user": {"type": "string"}}, ["user"]),
    ),
    ToolSpec(
        name="query_file_context",
        description="Read correlated file context already stored for this incident.",
        parameters=_object_schema({"document": {"type": "string"}}, ["document"]),
    ),
    ToolSpec(
        name="query_device_context",
        description="Read correlated device context already stored for this incident.",
        parameters=_object_schema({"device": {"type": "string"}}, ["device"]),
    ),
)

RESPONSE_TOOLS: tuple[ToolSpec, ...] = (
    ToolSpec(
        name="revokeSignInSessions",
        description="Revoke Microsoft Entra sign-in sessions for one masked user.",
        parameters=_object_schema({"userId": {"type": "string"}}, ["userId"]),
    ),
    ToolSpec(
        name="disableUser",
        description="Disable one masked Microsoft Entra user.",
        parameters=_object_schema({"userId": {"type": "string"}}, ["userId"]),
    ),
    ToolSpec(
        name="isolateDevice",
        description="Isolate one managed device through the Defender API.",
        parameters=_object_schema({"deviceId": {"type": "string"}}, ["deviceId"]),
    ),
    ToolSpec(
        name="patchIncident",
        description="Set a Microsoft 365 incident status and classification.",
        parameters=_object_schema(
            {
                "incidentId": {"type": "string"},
                "status": {"type": "string"},
                "classification": {"type": "string"},
            },
            ["incidentId", "status", "classification"],
        ),
    ),
    ToolSpec(
        name="enrichAlert",
        description="Attach stored correlation context to the incident.",
        parameters=_object_schema({"incidentId": {"type": "string"}}, ["incidentId"]),
    ),
    ToolSpec(
        name="notifyUser",
        description="Queue a standard notice to the masked user. This does not send mail itself.",
        parameters=_object_schema({"userId": {"type": "string"}}, ["userId"]),
    ),
    ToolSpec(
        name="graphGet",
        description="Read back user, device, or incident state after remediation.",
        parameters=_object_schema(
            {
                "resource": {"type": "string", "enum": ["user", "device", "incident"]},
                "id": {"type": "string"},
            },
            ["resource", "id"],
        ),
    ),
)

COPILOT_TOOLS: tuple[ToolSpec, ...] = (
    ToolSpec(
        name="answer_incident_query",
        description="Answer one analyst question using only the current incident context.",
        parameters=_object_schema(
            {"question": {"type": "string"}, "context": {"type": "object"}},
            ["question", "context"],
        ),
    ),
    ToolSpec(
        name="write_closure_report",
        description="Write a masked post-closure audit report for the current incident.",
        parameters=_object_schema({"context": {"type": "object"}}, ["context"]),
    ),
    ToolSpec(
        name="write_knowledge_entry",
        description="Write a masked knowledge-base entry for the current incident.",
        parameters=_object_schema({"context": {"type": "object"}}, ["context"]),
    ),
)


def openai_tools(specs: tuple[ToolSpec, ...]) -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": spec.name,
                "description": spec.description,
                "parameters": spec.parameters,
            },
        }
        for spec in specs
    ]


def anthropic_tools(specs: tuple[ToolSpec, ...]) -> list[dict[str, Any]]:
    return [
        {
            "name": spec.name,
            "description": spec.description,
            "input_schema": spec.parameters,
        }
        for spec in specs
    ]


def bedrock_tools(specs: tuple[ToolSpec, ...]) -> list[dict[str, Any]]:
    return [
        {
            "toolSpec": {
                "name": spec.name,
                "description": spec.description,
                "inputSchema": {"json": spec.parameters},
            }
        }
        for spec in specs
    ]


def classify_category(narrative: str) -> tuple[str, float]:
    """Map a masked narrative to one category. The caller must mask it first."""
    text = narrative.lower()
    if "impossible travel" in text or "atypical travel" in text:
        return "Impossible Travel", 0.92
    if "oauth" in text or "illicit consent" in text or "malicious app" in text:
        return "Malicious OAuth App", 0.9
    if "dlp" in text or "exfiltration" in text:
        return "DLP Exfiltration", 0.9
    if "phish" in text:
        return "Phishing", 0.86
    return "Unclassified", 0.55


def recommend_runbook(category: str, priority: str, narrative: str) -> RecommendedRunbook:
    text = narrative.lower()
    if priority == "P3" or "false positive" in text:
        if "false positive" in text:
            runbook_id = "false_positive_closure"
            rationale = "P3 or an explicit false-positive statement uses the closure runbook."
        elif "notify" in text:
            runbook_id = "user_notification"
            rationale = "The narrative asks for a user notice and does not require containment."
        else:
            runbook_id = "alert_enrichment"
            rationale = "Low-risk intake is enriched and then verified."
    elif "notify" in text and category == "Unclassified":
        runbook_id = "user_notification"
        rationale = "Unclassified P2 notice matches the pre-approved notification policy."
    else:
        runbook_id = {
            "Impossible Travel": "revoke_sessions",
            "Malicious OAuth App": "disable_user",
            "DLP Exfiltration": "isolate_device",
            "Phishing": "disable_user",
            "Unclassified": "alert_enrichment",
        }[category]
        rationale = f"{category} maps to {runbook_id}."
    return RecommendedRunbook(
        runbook_id=runbook_id,
        actions=RUNBOOK_ACTIONS[runbook_id],
        rationale=rationale,
    )


class TriageInvestigationAgent:
    """Classify the narrative and read correlated user, file, and device context."""

    tools = TRIAGE_TOOLS

    def plan(self, masked: dict[str, Any]) -> list[ToolCall]:
        narrative = str(masked.get("narrative") or "")
        return [
            ToolCall("classify_category", {"narrative": narrative}),
            ToolCall("query_user_context", {"user": str(masked.get("userPrincipalName") or "")}),
            ToolCall("query_file_context", {"document": str(masked.get("documentTitle") or "")}),
            ToolCall("query_device_context", {"device": str(masked.get("deviceId") or "")}),
        ]

    def investigate(self, masked: dict[str, Any], context: dict[str, Any]) -> AgentResult:
        calls = self.plan(masked)
        category, confidence = classify_category(str(masked.get("narrative") or ""))
        priority = str(masked.get("priority") or "P3")
        runbook = recommend_runbook(category, priority, str(masked.get("narrative") or ""))
        evidence = [
            f"user={context.get('user') or 'none'}",
            f"files={context.get('files') or 'none'}",
            f"device={context.get('device') or 'none'}",
        ]
        summary = RootCauseSummary(
            category=category,
            confidence=confidence,
            narrative=f"{category} at {priority}. {runbook.rationale}",
            evidence=tuple(evidence),
        )
        return AgentResult(
            calls=calls,
            output={
                "root_cause": {
                    "category": summary.category,
                    "confidence": summary.confidence,
                    "narrative": summary.narrative,
                    "evidence": list(summary.evidence),
                },
                "runbook": {
                    "runbook_id": runbook.runbook_id,
                    "actions": list(runbook.actions),
                    "rationale": runbook.rationale,
                },
            },
        )


class ResponseExecutionAgent:
    """Plan approved remediation and the Graph GET that checks it."""

    tools = RESPONSE_TOOLS

    def plan(self, masked: dict[str, Any], actions: tuple[str, ...] | list[str]) -> list[ToolCall]:
        calls: list[ToolCall] = []
        classification = (
            "falsePositive" if masked.get("runbook_id") == "false_positive_closure" else "truePositive"
        )
        for action in actions:
            if action in {"revokeSignInSessions", "disableUser", "notifyUser"}:
                calls.append(ToolCall(action, {"userId": str(masked.get("userPrincipalName") or "")}))
            elif action == "isolateDevice":
                calls.append(ToolCall(action, {"deviceId": str(masked.get("deviceId") or "")}))
            elif action == "patchIncident":
                calls.append(
                    ToolCall(
                        action,
                        {
                            "incidentId": str(masked.get("incidentId") or ""),
                            "status": "resolved",
                            "classification": classification,
                        },
                    )
                )
            elif action == "enrichAlert":
                calls.append(ToolCall(action, {"incidentId": str(masked.get("incidentId") or "")}))
        return calls

    def verification_calls(self, executed: list[ToolCall]) -> list[ToolCall]:
        checks: list[ToolCall] = []
        for call in executed:
            if call.name in {"revokeSignInSessions", "disableUser", "notifyUser"}:
                checks.append(ToolCall("graphGet", {"resource": "user", "id": call.arguments["userId"]}))
            elif call.name == "isolateDevice":
                checks.append(ToolCall("graphGet", {"resource": "device", "id": call.arguments["deviceId"]}))
            elif call.name in {"patchIncident", "enrichAlert"}:
                checks.append(
                    ToolCall("graphGet", {"resource": "incident", "id": call.arguments["incidentId"]})
                )
        return checks


class SocCopilotAgent:
    """Answer from the current incident only, and write the closure artifacts."""

    tools = COPILOT_TOOLS

    def answer(self, question: str, context: dict[str, Any]) -> AgentResult:
        call = ToolCall("answer_incident_query", {"question": question, "context": context})
        if _outside_context(question, context):
            output = {
                "scoped": False,
                "answer": "That question is outside this incident.",
            }
        else:
            output = {"scoped": True, "answer": _answer_from_context(question, context)}
        return AgentResult(calls=[call], output=output)

    def close(self, context: dict[str, Any]) -> AgentResult:
        report = {
            "title": f"{context.get('category', 'Incident')} closed",
            "body": (
                f"Priority {context.get('priority')} category {context.get('category')} "
                f"closed with runbook {context.get('runbook_id')} after Graph verification."
            ),
        }
        knowledge = {
            "title": str(context.get("category") or "Incident"),
            "body": (
                f"Runbook {context.get('runbook_id')} was verified for "
                f"{context.get('category')} at {context.get('priority')}."
            ),
        }
        return AgentResult(
            calls=[
                ToolCall("write_closure_report", {"context": context}),
                ToolCall("write_knowledge_entry", {"context": context}),
            ],
            output={"report": report, "knowledge": knowledge},
        )


def transcript_text(result: AgentResult) -> str:
    return json.dumps(
        [{"name": call.name, "arguments": call.arguments} for call in result.calls] + [result.output],
        sort_keys=True,
    )


def _outside_context(question: str, context: dict[str, Any]) -> bool:
    lowered = question.lower()
    if any(word in lowered for word in ("password", "secret", "credential", "all tenants", "other tenant")):
        return True
    haystack = json.dumps(context, sort_keys=True)
    for pattern in (_EMAIL, _IPV4):
        for match in pattern.findall(question):
            if match not in haystack:
                return True
    for token in re.findall(r"\[(?:USER|IP|NAME|DOC)_\d{2,}\]", question):
        if token not in haystack:
            return True
    return False


def _answer_from_context(question: str, context: dict[str, Any]) -> str:
    lowered = question.lower()
    if "category" in lowered:
        return f"Category is {context.get('category')}."
    if "runbook" in lowered or "recommend" in lowered:
        return f"Recommended runbook is {context.get('runbook_id')}."
    if "priority" in lowered or "sla" in lowered:
        return f"Priority is {context.get('priority')} with stage {context.get('stage')}."
    if "status" in lowered or "stage" in lowered:
        return f"Stage is {context.get('stage')}."
    return (
        f"This incident is {context.get('category')} at {context.get('priority')}, "
        f"stage {context.get('stage')}, runbook {context.get('runbook_id')}."
    )
