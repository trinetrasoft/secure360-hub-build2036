"""Ticket workflow tables.

Revision ID: 20261117_0002
Revises: 20261117_0001
Create Date: 2026-11-17
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20261117_0002"
down_revision = "20261117_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tickets",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("priority", sa.String(length=8), nullable=False),
        sa.Column("risk_score", sa.Integer(), nullable=False),
        sa.Column("stage", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("correlated_incident_id", sa.String(length=36), nullable=True),
        sa.Column("user_principal_name", sa.Text(), nullable=True),
        sa.Column("source_ip", sa.String(length=64), nullable=True),
        sa.Column("device_id", sa.Text(), nullable=True),
        sa.Column("graph_incident_id", sa.String(length=128), nullable=True),
        sa.Column("category", sa.String(length=64), nullable=True),
        sa.Column("runbook_id", sa.String(length=64), nullable=True),
        sa.Column("root_cause", sa.JSON(), nullable=True),
        sa.Column("runbook", sa.JSON(), nullable=True),
        sa.Column("evidence", sa.JSON(), nullable=True),
        sa.Column("report", sa.JSON(), nullable=True),
        sa.Column("approval_mode", sa.String(length=32), nullable=True),
        sa.Column("approval_status", sa.String(length=32), nullable=False),
        sa.Column("policy_id", sa.String(length=64), nullable=True),
        sa.Column("token_hash", sa.String(length=64), nullable=True),
        sa.Column("token_consumed", sa.Integer(), nullable=False),
        sa.Column("assignee_role", sa.String(length=32), nullable=True),
        sa.Column("opened_at", sa.String(length=32), nullable=False),
        sa.Column("sla_due_at", sa.String(length=32), nullable=False),
        sa.Column("sla_minutes", sa.Integer(), nullable=False),
        sa.Column("closed_at", sa.String(length=32), nullable=True),
    )
    op.create_index("ix_ticket_tenant_stage", "tickets", ["tenant_id", "stage"])

    op.create_table(
        "ticket_stage_events",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("ticket_id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("stage", sa.String(length=32), nullable=False),
        sa.Column("entered_at", sa.String(length=32), nullable=False),
        sa.Column("sla_due_at", sa.String(length=32), nullable=False),
        sa.Column("sla_minutes", sa.Integer(), nullable=False),
        sa.Column("actor", sa.String(length=128), nullable=False),
        sa.Column("note", sa.String(length=256), nullable=False),
        sa.ForeignKeyConstraint(["ticket_id"], ["tickets.id"]),
    )
    op.create_index("ix_ticket_stage_event", "ticket_stage_events", ["ticket_id", "entered_at"])

    op.create_table(
        "knowledge_base_entries",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("ticket_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(["ticket_id"], ["tickets.id"]),
    )
    op.create_index("ix_knowledge_tenant", "knowledge_base_entries", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_knowledge_tenant", table_name="knowledge_base_entries")
    op.drop_table("knowledge_base_entries")
    op.drop_index("ix_ticket_stage_event", table_name="ticket_stage_events")
    op.drop_table("ticket_stage_events")
    op.drop_index("ix_ticket_tenant_stage", table_name="tickets")
    op.drop_table("tickets")
