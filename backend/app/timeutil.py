"""UTC helpers shared by the pollers and the checkpoint store."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timedelta, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def parse_datetime(value: str) -> datetime:
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    parsed = datetime.fromisoformat(text)
    return ensure_utc(parsed)


def format_graph(value: datetime) -> str:
    """Graph Security ``DateTimeOffset`` literal, second precision, UTC."""
    stamp = ensure_utc(value).replace(microsecond=0)
    return stamp.strftime("%Y-%m-%dT%H:%M:%SZ")


def format_o365(value: datetime) -> str:
    """Office 365 Management API ``startTime`` / ``endTime`` format."""
    stamp = ensure_utc(value).replace(microsecond=0)
    return stamp.strftime("%Y-%m-%dT%H:%M:%S")


def graph_checkpoint_filter(cursor: datetime) -> str:
    """Build ``lastUpdateDateTime gt {checkpoint}``.

    The stored cursor is the newest event already persisted. The filter looks
    back one second so a second event written in that same second is not
    skipped. Identity dedup drops the overlap.
    """
    lookback = ensure_utc(cursor) - timedelta(seconds=1)
    return f"lastUpdateDateTime gt {format_graph(lookback)}"


def iter_windows(
    start: datetime,
    end: datetime,
    *,
    hours: int = 23,
) -> Iterator[tuple[datetime, datetime]]:
    """Yield half-open windows no longer than ``hours``.

    The Management Activity content API rejects ranges of 24 hours or more.
    """
    cursor = ensure_utc(start)
    end = ensure_utc(end)
    step = timedelta(hours=hours)
    while cursor < end:
        window_end = min(cursor + step, end)
        yield cursor, window_end
        cursor = window_end
