"""Risk-based gates in front of remediation.

P1 never auto-executes. An Incident Commander must submit the one-time
approval token. P2 runs when an analyst clicks approve, or when the runbook
matches a pre-approved policy. P3 auto-executes only the low-risk runbooks
and leaves every other runbook waiting for an analyst.
"""

from __future__ import annotations

from dataclasses import dataclass

LOW_RISK_RUNBOOKS = frozenset(
    {"alert_enrichment", "user_notification", "false_positive_closure"}
)

PREAPPROVED_POLICIES: dict[str, frozenset[str]] = {
    "preapproved-user-notification": frozenset({"user_notification"}),
    "preapproved-enrichment": frozenset({"alert_enrichment", "false_positive_closure"}),
}


@dataclass(frozen=True)
class ApprovalDecision:
    mode: str
    execution_allowed: bool
    escalate_to: str | None
    policy_id: str | None
    reason: str


def matching_policy(priority: str, runbook_id: str, policy_id: str | None = None) -> str | None:
    """Return a pre-approved policy id for P2/P3, or None."""
    if priority not in {"P2", "P3"}:
        return None
    if policy_id is not None:
        allowed = PREAPPROVED_POLICIES.get(policy_id)
        if allowed and runbook_id in allowed:
            return policy_id
        return None
    for candidate, runbooks in PREAPPROVED_POLICIES.items():
        if runbook_id in runbooks:
            return candidate
    return None


def evaluate(
    priority: str,
    runbook_id: str,
    *,
    approved: bool,
    policy_id: str | None = None,
) -> ApprovalDecision:
    """Decide whether the response agent may execute this runbook."""
    if priority == "P1":
        return ApprovalDecision(
            mode="commander_token",
            execution_allowed=approved,
            escalate_to="INCIDENT_COMMANDER",
            policy_id=None,
            reason="P1 blocks automated execution until an Incident Commander submits an approval token",
        )
    if priority == "P2":
        matched = matching_policy(priority, runbook_id, policy_id)
        if matched is not None and (policy_id is None or policy_id == matched):
            return ApprovalDecision(
                mode="preapproved_policy",
                execution_allowed=True,
                escalate_to=None,
                policy_id=matched,
                reason="P2 runbook matches a pre-approved policy",
            )
        return ApprovalDecision(
            mode="analyst_click",
            execution_allowed=approved,
            escalate_to="SOC_ANALYST",
            policy_id=None,
            reason="P2 waits for analyst approval or a matching pre-approved policy",
        )
    if runbook_id in LOW_RISK_RUNBOOKS:
        return ApprovalDecision(
            mode="auto_execute",
            execution_allowed=True,
            escalate_to=None,
            policy_id=matching_policy("P3", runbook_id),
            reason="P3 low-risk runbook auto-executes and must pass a Graph GET check",
        )
    return ApprovalDecision(
        mode="analyst_click",
        execution_allowed=approved,
        escalate_to="SOC_ANALYST",
        policy_id=None,
        reason="P3 runbook is outside the low-risk auto-execute set",
    )
