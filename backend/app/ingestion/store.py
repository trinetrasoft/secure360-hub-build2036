"""Async persistence for events, checkpoints, content blobs, and the webhook inbox."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.security import (
    CanonicalSecurityEvent as EventRow,
)
from app.models.security import Checkpoint, ProcessedContentBlob, WebhookInbox, new_id
from app.schemas.security import (
    CanonicalSecurityEvent,
    CanonicalSecurityEventView,
    CheckpointView,
)
from app.timeutil import ensure_utc, format_graph, parse_datetime, utcnow

SessionFactory = async_sessionmaker[AsyncSession]


@dataclass(frozen=True)
class Envelope:
    id: str
    kind: str
    tenant_id: str | None
    notification: dict[str, Any]
    status: str
    attempts: int


async def save_event(
    sessions: SessionFactory,
    event: CanonicalSecurityEvent,
    raw: dict[str, Any],
) -> str:
    """Insert or update one event. Returns ``inserted``, ``updated``, or ``duplicate``."""
    async with sessions() as session:
        try:
            async with session.begin():
                existing = await session.scalar(
                    select(EventRow).where(
                        EventRow.tenant_id == event.tenant_id,
                        EventRow.source == event.source,
                        EventRow.external_id == event.external_id,
                    )
                )
                if existing is None:
                    session.add(
                        EventRow(
                            source=event.source,
                            tenant_id=event.tenant_id,
                            event_type=event.event_type,
                            external_id=event.external_id,
                            actor=event.actor,
                            device=event.device,
                            resource=event.resource,
                            severity=event.severity,
                            feed_type=event.feed_type,
                            occurred_at=event.occurred_at,
                            raw_payload_hash=event.raw_payload_hash,
                            raw_payload=raw,
                            ingested_at=utcnow(),
                        )
                    )
                    return "inserted"
                if existing.raw_payload_hash == event.raw_payload_hash:
                    return "duplicate"
                existing.event_type = event.event_type
                existing.actor = event.actor
                existing.device = event.device
                existing.resource = event.resource
                existing.severity = event.severity
                existing.feed_type = event.feed_type
                existing.occurred_at = event.occurred_at
                existing.raw_payload_hash = event.raw_payload_hash
                existing.raw_payload = raw
                existing.ingested_at = utcnow()
                return "updated"
        except IntegrityError:
            return "duplicate"


async def get_checkpoint(
    sessions: SessionFactory,
    tenant_id: str,
    feed_type: str,
) -> datetime | None:
    async with sessions() as session:
        row = await session.scalar(
            select(Checkpoint).where(
                Checkpoint.tenant_id == tenant_id,
                Checkpoint.feed_type == feed_type,
            )
        )
        if row is None:
            return None
        return parse_datetime(row.cursor)


async def save_checkpoint(
    sessions: SessionFactory,
    tenant_id: str,
    feed_type: str,
    cursor: datetime,
) -> None:
    stamp = format_graph(ensure_utc(cursor))
    async with sessions() as session:
        async with session.begin():
            row = await session.scalar(
                select(Checkpoint).where(
                    Checkpoint.tenant_id == tenant_id,
                    Checkpoint.feed_type == feed_type,
                )
            )
            now = utcnow()
            if row is None:
                session.add(
                    Checkpoint(
                        tenant_id=tenant_id,
                        feed_type=feed_type,
                        cursor=stamp,
                        updated_at=now,
                    )
                )
                return
            row.cursor = stamp
            row.updated_at = now


async def list_checkpoints(
    sessions: SessionFactory,
    tenant_id: str,
) -> list[CheckpointView]:
    async with sessions() as session:
        rows = (
            await session.scalars(
                select(Checkpoint)
                .where(Checkpoint.tenant_id == tenant_id)
                .order_by(Checkpoint.feed_type)
            )
        ).all()
        return [
            CheckpointView(
                tenant_id=row.tenant_id,
                feed_type=row.feed_type,
                cursor=row.cursor,
                updated_at=row.updated_at,
            )
            for row in rows
        ]


async def blob_exists(sessions: SessionFactory, tenant_id: str, content_id: str) -> bool:
    async with sessions() as session:
        row = await session.scalar(
            select(ProcessedContentBlob.id).where(
                ProcessedContentBlob.tenant_id == tenant_id,
                ProcessedContentBlob.content_id == content_id,
            )
        )
        return row is not None


async def mark_blob(
    sessions: SessionFactory,
    tenant_id: str,
    content_id: str,
    content_type: str,
) -> None:
    if await blob_exists(sessions, tenant_id, content_id):
        return
    async with sessions() as session:
        try:
            async with session.begin():
                session.add(
                    ProcessedContentBlob(
                        tenant_id=tenant_id,
                        content_id=content_id,
                        content_type=content_type,
                        processed_at=utcnow(),
                    )
                )
        except IntegrityError:
            return


async def enqueue_notification(
    sessions: SessionFactory,
    *,
    kind: str,
    tenant_id: str | None,
    notification: dict[str, Any],
) -> str:
    envelope_id = new_id()
    async with sessions() as session:
        async with session.begin():
            session.add(
                WebhookInbox(
                    id=envelope_id,
                    kind=kind,
                    tenant_id=tenant_id,
                    payload={"notification": notification},
                    status="queued",
                    attempts=0,
                    received_at=utcnow(),
                )
            )
    return envelope_id


async def get_envelope(sessions: SessionFactory, envelope_id: str) -> Envelope | None:
    async with sessions() as session:
        row = await session.get(WebhookInbox, envelope_id)
        if row is None:
            return None
        notification = {}
        if isinstance(row.payload, dict):
            raw = row.payload.get("notification")
            if isinstance(raw, dict):
                notification = raw
        return Envelope(
            id=row.id,
            kind=row.kind,
            tenant_id=row.tenant_id,
            notification=notification,
            status=row.status,
            attempts=row.attempts,
        )


async def mark_envelope(
    sessions: SessionFactory,
    envelope_id: str,
    status: str,
    error: str | None = None,
) -> None:
    async with sessions() as session:
        async with session.begin():
            row = await session.get(WebhookInbox, envelope_id)
            if row is None:
                return
            row.status = status
            row.last_error = error
            if status != "processed":
                row.attempts = row.attempts + 1


async def pending_envelope_ids(sessions: SessionFactory) -> list[str]:
    async with sessions() as session:
        rows = (
            await session.scalars(
                select(WebhookInbox.id).where(WebhookInbox.status == "queued")
            )
        ).all()
        return list(rows)


async def list_events(
    sessions: SessionFactory,
    *,
    tenant_id: str | None = None,
    limit: int = 100,
) -> list[CanonicalSecurityEventView]:
    async with sessions() as session:
        statement = select(EventRow).order_by(EventRow.ingested_at.desc()).limit(limit)
        if tenant_id:
            statement = statement.where(EventRow.tenant_id == tenant_id)
        rows = (await session.scalars(statement)).all()
        return [
            CanonicalSecurityEventView(
                id=row.id,
                source=row.source,
                tenant_id=row.tenant_id,
                event_type=row.event_type,
                actor=row.actor,
                device=row.device,
                resource=row.resource,
                severity=row.severity,
                raw_payload_hash=row.raw_payload_hash,
                external_id=row.external_id,
                feed_type=row.feed_type,
                occurred_at=row.occurred_at,
                ingested_at=row.ingested_at,
            )
            for row in rows
        ]
