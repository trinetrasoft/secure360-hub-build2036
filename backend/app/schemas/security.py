"""Pydantic contracts for normalized events and poll results."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Severity = Literal["informational", "low", "medium", "high", "critical"]

SOURCE_GRAPH = "microsoft_graph_security"
SOURCE_O365 = "o365_management_activity"


class CanonicalSecurityEvent(BaseModel):
    """Unified event produced from Graph Security and the activity feed.

    ``raw_payload_hash`` is SHA-256 of the canonical JSON payload. ``external_id``
    is the publisher id used with ``source`` and ``tenant_id`` to drop duplicates
    when a checkpoint overlap is replayed.
    """

    model_config = ConfigDict(extra="forbid")

    source: str
    tenant_id: str
    event_type: str
    actor: str | None = None
    device: str | None = None
    resource: str | None = None
    severity: Severity
    raw_payload_hash: str = Field(min_length=64, max_length=64)
    external_id: str
    feed_type: str
    occurred_at: datetime | None = None


class FeedPollResult(BaseModel):
    feed_type: str
    inserted: int = 0
    updated: int = 0
    duplicates: int = 0
    checkpoint: str | None = None
    error: str | None = None


class PollSummary(BaseModel):
    tenant_id: str
    feeds: list[FeedPollResult]


class CheckpointView(BaseModel):
    tenant_id: str
    feed_type: str
    cursor: str
    updated_at: datetime


class CanonicalSecurityEventView(BaseModel):
    id: str
    source: str
    tenant_id: str
    event_type: str
    actor: str | None
    device: str | None
    resource: str | None
    severity: str
    raw_payload_hash: str
    external_id: str
    feed_type: str
    occurred_at: datetime | None
    ingested_at: datetime
