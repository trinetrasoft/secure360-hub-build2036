"""Persistence models for canonical events, cursors, and webhook intake."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import JSON, DateTime, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.timeutil import utcnow


def new_id() -> str:
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class CanonicalSecurityEvent(Base):
    """Stored form of a normalized Microsoft 365 security event."""

    __tablename__ = "canonical_security_events"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "source",
            "external_id",
            name="uq_canonical_event_identity",
        ),
        Index("ix_canonical_event_tenant_time", "tenant_id", "occurred_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(256), nullable=False)
    external_id: Mapped[str] = mapped_column(Text, nullable=False)
    actor: Mapped[str | None] = mapped_column(Text, nullable=True)
    device: Mapped[str | None] = mapped_column(Text, nullable=True)
    resource: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    feed_type: Mapped[str] = mapped_column(String(64), nullable=False)
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    raw_payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    raw_payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )


class Checkpoint(Base):
    """Incremental cursor for one tenant and one feed.

    Restarts read this row and continue with ``lastUpdateDateTime gt cursor``
    (Graph) or the next Management Activity window (Office 365). The cursor
    moves only after the events it covers are committed.
    """

    __tablename__ = "checkpoints"
    __table_args__ = (
        UniqueConstraint("tenant_id", "feed_type", name="uq_checkpoint_feed"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    feed_type: Mapped[str] = mapped_column(String(64), nullable=False)
    cursor: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ProcessedContentBlob(Base):
    """Office 365 content blob already fetched. Dedups the overlap window."""

    __tablename__ = "processed_content_blobs"
    __table_args__ = (
        UniqueConstraint("tenant_id", "content_id", name="uq_processed_content_blob"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    content_id: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(String(64), nullable=False)
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class WebhookInbox(Base):
    """Durable queue row written before the HTTP handler returns.

    A crash after the response still leaves ``status=queued`` for the worker
    to pick up on startup.
    """

    __tablename__ = "webhook_inbox"
    __table_args__ = (Index("ix_webhook_inbox_status", "status"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="queued")
    attempts: Mapped[int] = mapped_column(nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
