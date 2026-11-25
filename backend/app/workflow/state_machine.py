"""Six-stage ticket lifecycle.

Stages move only one step forward:

    1. INTAKE -> 2. AI TRIAGE -> 3. INVESTIGATE -> 4. ASSIGN
    -> 5. RESOLVE -> 6. VERIFY & CLOSE

Each stage records when it was entered and its own SLA deadline. The ticket
SLA clock starts at intake and is never extended.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from app.timeutil import ensure_utc, format_graph

INTAKE = "1. INTAKE"
AI_TRIAGE = "2. AI TRIAGE"
INVESTIGATE = "3. INVESTIGATE"
ASSIGN = "4. ASSIGN"
RESOLVE = "5. RESOLVE"
VERIFY_CLOSE = "6. VERIFY & CLOSE"

STAGES: tuple[str, ...] = (
    INTAKE,
    AI_TRIAGE,
    INVESTIGATE,
    ASSIGN,
    RESOLVE,
    VERIFY_CLOSE,
)

NEXT_STAGE: dict[str, str | None] = {
    INTAKE: AI_TRIAGE,
    AI_TRIAGE: INVESTIGATE,
    INVESTIGATE: ASSIGN,
    ASSIGN: RESOLVE,
    RESOLVE: VERIFY_CLOSE,
    VERIFY_CLOSE: None,
}

SOURCES = frozenset({"m365_detection", "employee_portal", "email_report", "teams_bot"})

PRIORITY_SLA_MINUTES = {"P1": 15, "P2": 120, "P3": 24 * 60}

# Relative weight of each stage inside the priority SLA. The sum is 13.
_STAGE_WEIGHT = {
    INTAKE: 1,
    AI_TRIAGE: 2,
    INVESTIGATE: 3,
    ASSIGN: 2,
    RESOLVE: 4,
    VERIFY_CLOSE: 1,
}
_WEIGHT_TOTAL = sum(_STAGE_WEIGHT.values())


class IllegalTransition(Exception):
    """The requested move is not the single next stage."""


@dataclass(frozen=True)
class StageTimer:
    stage: str
    entered_at: str
    sla_due_at: str
    sla_minutes: int


def next_stage(current: str) -> str:
    """Return the only legal successor. Terminal and unknown stages raise."""
    if current not in NEXT_STAGE:
        raise IllegalTransition(f"unknown stage {current}")
    successor = NEXT_STAGE[current]
    if successor is None:
        raise IllegalTransition(f"{current} is terminal")
    return successor


def sla_minutes_for(priority: str) -> int:
    try:
        return PRIORITY_SLA_MINUTES[priority]
    except KeyError as exc:
        raise IllegalTransition(f"unknown priority {priority}") from exc


def stage_budget_minutes(priority: str, stage: str) -> int:
    """Minutes allowed for one stage, at least one, taken from the priority SLA."""
    if stage not in _STAGE_WEIGHT:
        raise IllegalTransition(f"unknown stage {stage}")
    total = sla_minutes_for(priority)
    share = total * _STAGE_WEIGHT[stage] / _WEIGHT_TOTAL
    return max(1, int(round(share)))


def start_timer(priority: str, stage: str, now: datetime) -> StageTimer:
    entered = ensure_utc(now).replace(microsecond=0)
    budget = stage_budget_minutes(priority, stage)
    due = entered + timedelta(minutes=budget)
    return StageTimer(
        stage=stage,
        entered_at=format_graph(entered),
        sla_due_at=format_graph(due),
        sla_minutes=budget,
    )


def ticket_due(priority: str, opened_at: datetime) -> str:
    opened = ensure_utc(opened_at).replace(microsecond=0)
    return format_graph(opened + timedelta(minutes=sla_minutes_for(priority)))
