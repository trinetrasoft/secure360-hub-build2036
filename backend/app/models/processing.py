"""Persisted fingerprints and correlated incidents."""

from __future__ import annotations

from sqlalchemy import JSON, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.security import Base, new_id


class EventFingerprint(Base):
    """Deterministic dedup key for one provider alert in one time bucket."""

    __tablename__ = "event_fingerprints"
    __table_args__ = (
        UniqueConstraint("tenant_id", "fingerprint", name="uq_event_fingerprint"),
        Index("ix_event_fingerprint_tenant", "tenant_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    provider_alert_id: Mapped[str] = mapped_column(Text, nullable=False)
    timestamp_bucket: Mapped[int] = mapped_column(Integer, nullable=False)
    event_id: Mapped[str | None] = mapped_column(String(36), nullable=True)


class CorrelatedIncident(Base):
    """One incident built from related signals inside the sliding window."""

    __tablename__ = "correlated_incidents"
    __table_args__ = (Index("ix_correlated_incident_tenant", "tenant_id", "status"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    risk_score: Mapped[int] = mapped_column(Integer, nullable=False)
    priority: Mapped[str] = mapped_column(String(8), nullable=False)
    priority_label: Mapped[str] = mapped_column(String(32), nullable=False)
    sla_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    sla_due_at: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="open")
    window_start: Mapped[str] = mapped_column(String(32), nullable=False)
    window_end: Mapped[str] = mapped_column(String(32), nullable=False)
    user_principal_names: Mapped[list] = mapped_column(JSON, nullable=False)
    source_ips: Mapped[list] = mapped_column(JSON, nullable=False)
    device_ids: Mapped[list] = mapped_column(JSON, nullable=False)
    opened_at: Mapped[str] = mapped_column(String(32), nullable=False)


class IncidentSignal(Base):
    """A non-duplicate signal attached to a correlated incident."""

    __tablename__ = "incident_signals"
    __table_args__ = (
        UniqueConstraint("tenant_id", "fingerprint", name="uq_incident_signal_fingerprint"),
        Index("ix_incident_signal_incident", "incident_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    incident_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("correlated_incidents.id"), nullable=False
    )
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    event_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    provider_alert_id: Mapped[str] = mapped_column(Text, nullable=False)
    occurred_at: Mapped[str] = mapped_column(String(32), nullable=False)
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    user_principal_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    device_id: Mapped[str | None] = mapped_column(Text, nullable=True)
