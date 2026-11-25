"""Tickets, stage timers, and closure knowledge-base entries."""

from __future__ import annotations

from sqlalchemy import JSON, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.security import Base, new_id


class Ticket(Base):
    """One SOC ticket moving through the six-stage machine."""

    __tablename__ = "tickets"
    __table_args__ = (Index("ix_ticket_tenant_stage", "tenant_id", "stage"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[str] = mapped_column(String(8), nullable=False)
    risk_score: Mapped[int] = mapped_column(Integer, nullable=False)
    stage: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open")
    correlated_incident_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    user_principal_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    device_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    graph_incident_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    runbook_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    root_cause: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    runbook: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    evidence: Mapped[list | None] = mapped_column(JSON, nullable=True)
    report: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    approval_mode: Mapped[str | None] = mapped_column(String(32), nullable=True)
    approval_status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    policy_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    token_consumed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    assignee_role: Mapped[str | None] = mapped_column(String(32), nullable=True)
    opened_at: Mapped[str] = mapped_column(String(32), nullable=False)
    sla_due_at: Mapped[str] = mapped_column(String(32), nullable=False)
    sla_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    closed_at: Mapped[str | None] = mapped_column(String(32), nullable=True)


class TicketStageEvent(Base):
    """Append-only record of a stage entry and that stage's SLA deadline."""

    __tablename__ = "ticket_stage_events"
    __table_args__ = (Index("ix_ticket_stage_event", "ticket_id", "entered_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    ticket_id: Mapped[str] = mapped_column(String(36), ForeignKey("tickets.id"), nullable=False)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    stage: Mapped[str] = mapped_column(String(32), nullable=False)
    entered_at: Mapped[str] = mapped_column(String(32), nullable=False)
    sla_due_at: Mapped[str] = mapped_column(String(32), nullable=False)
    sla_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    actor: Mapped[str] = mapped_column(String(128), nullable=False)
    note: Mapped[str] = mapped_column(String(256), nullable=False)


class KnowledgeBaseEntry(Base):
    """Masked post-closure note the copilot writes for the tenant."""

    __tablename__ = "knowledge_base_entries"
    __table_args__ = (Index("ix_knowledge_tenant", "tenant_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    ticket_id: Mapped[str] = mapped_column(String(36), ForeignKey("tickets.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(String(32), nullable=False)
