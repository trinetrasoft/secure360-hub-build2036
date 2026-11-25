"""Create processing and governance tables.

Revision ID: 20261117_0001
Revises:
Create Date: 2026-11-17
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20261117_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "event_fingerprints",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("provider_alert_id", sa.Text(), nullable=False),
        sa.Column("timestamp_bucket", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.String(length=36), nullable=True),
        sa.UniqueConstraint("tenant_id", "fingerprint", name="uq_event_fingerprint"),
    )
    op.create_index("ix_event_fingerprint_tenant", "event_fingerprints", ["tenant_id"])

    op.create_table(
        "correlated_incidents",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("risk_score", sa.Integer(), nullable=False),
        sa.Column("priority", sa.String(length=8), nullable=False),
        sa.Column("priority_label", sa.String(length=32), nullable=False),
        sa.Column("sla_minutes", sa.Integer(), nullable=False),
        sa.Column("sla_due_at", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("window_start", sa.String(length=32), nullable=False),
        sa.Column("window_end", sa.String(length=32), nullable=False),
        sa.Column("user_principal_names", sa.JSON(), nullable=False),
        sa.Column("source_ips", sa.JSON(), nullable=False),
        sa.Column("device_ids", sa.JSON(), nullable=False),
        sa.Column("opened_at", sa.String(length=32), nullable=False),
    )
    op.create_index(
        "ix_correlated_incident_tenant",
        "correlated_incidents",
        ["tenant_id", "status"],
    )

    op.create_table(
        "incident_signals",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("incident_id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("event_id", sa.String(length=36), nullable=True),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("provider_alert_id", sa.Text(), nullable=False),
        sa.Column("occurred_at", sa.String(length=32), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=False),
        sa.Column("user_principal_name", sa.Text(), nullable=True),
        sa.Column("source_ip", sa.String(length=64), nullable=True),
        sa.Column("device_id", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["incident_id"], ["correlated_incidents.id"]),
        sa.UniqueConstraint("tenant_id", "fingerprint", name="uq_incident_signal_fingerprint"),
    )
    op.create_index("ix_incident_signal_incident", "incident_signals", ["incident_id"])

    op.create_table(
        "pii_vault",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("entity_type", sa.String(length=16), nullable=False),
        sa.Column("token", sa.String(length=32), nullable=False),
        sa.Column("token_number", sa.Integer(), nullable=False),
        sa.Column("blind_index", sa.String(length=64), nullable=False),
        sa.Column("ciphertext", sa.Text(), nullable=False),
        sa.Column("created_at", sa.String(length=32), nullable=False),
        sa.UniqueConstraint(
            "tenant_id", "entity_type", "blind_index", name="uq_pii_blind_index"
        ),
        sa.UniqueConstraint("tenant_id", "token", name="uq_pii_token"),
    )
    op.create_index("ix_pii_vault_tenant", "pii_vault", ["tenant_id"])

    op.create_table(
        "audit_log",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("actor", sa.String(length=128), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=64), nullable=False),
        sa.Column("target_id", sa.String(length=64), nullable=False),
        sa.Column("summary", sa.String(length=512), nullable=False),
        sa.Column("created_at", sa.String(length=32), nullable=False),
        sa.Column("previous_hash", sa.String(length=64), nullable=False),
        sa.Column("record_hash", sa.String(length=64), nullable=False),
        sa.UniqueConstraint("tenant_id", "sequence", name="uq_audit_sequence"),
    )
    op.create_index("ix_audit_tenant_sequence", "audit_log", ["tenant_id", "sequence"])


def downgrade() -> None:
    op.drop_index("ix_audit_tenant_sequence", table_name="audit_log")
    op.drop_table("audit_log")
    op.drop_index("ix_pii_vault_tenant", table_name="pii_vault")
    op.drop_table("pii_vault")
    op.drop_index("ix_incident_signal_incident", table_name="incident_signals")
    op.drop_table("incident_signals")
    op.drop_index("ix_correlated_incident_tenant", table_name="correlated_incidents")
    op.drop_table("correlated_incidents")
    op.drop_index("ix_event_fingerprint_tenant", table_name="event_fingerprints")
    op.drop_table("event_fingerprints")
