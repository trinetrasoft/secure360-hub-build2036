"""HTTP retry policy for Microsoft 365 throttling.

Only HTTP 429 is retried. ``Retry-After`` (delta-seconds or HTTP-date) wins.
When the header is absent the wait doubles from ``base_delay`` and is capped
by ``max_delay``. Callers inject ``sleeper`` so tests do not wait on the clock.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

Sleeper = Callable[[float], Awaitable[None]]


class ThrottledError(Exception):
    """Raised when Microsoft keeps returning HTTP 429 after the retry budget."""

    def __init__(self, message: str, *, retry_after: float | None = None):
        super().__init__(message)
        self.retry_after = retry_after


def retry_after_seconds(header: str | None, fallback: float) -> float:
    if header is None or header.strip() == "":
        return fallback
    try:
        return max(0.0, float(header.strip()))
    except ValueError:
        pass
    try:
        when = parsedate_to_datetime(header.strip())
    except (TypeError, ValueError, IndexError):
        return fallback
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return max(0.0, (when - datetime.now(timezone.utc)).total_seconds())


async def request_with_backoff(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    max_attempts: int = 5,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    sleeper: Sleeper = asyncio.sleep,
    **kwargs: object,
) -> httpx.Response:
    """Send one HTTP request, backing off while the response is HTTP 429."""
    if max_attempts < 1:
        raise ValueError("max_attempts must be at least 1")

    delay = base_delay
    for attempt in range(1, max_attempts + 1):
        response = await client.request(method, url, **kwargs)
        if response.status_code != 429:
            return response
        wait = min(retry_after_seconds(response.headers.get("Retry-After"), delay), max_delay)
        parsed = urlparse(url)
        logger.warning(
            "HTTP 429 from %s%s; waiting %.1fs (attempt %s/%s)",
            parsed.netloc,
            parsed.path,
            wait,
            attempt,
            max_attempts,
        )
        if attempt == max_attempts:
            raise ThrottledError(
                "Microsoft 365 returned HTTP 429 after the retry budget was exhausted",
                retry_after=wait,
            )
        await sleeper(wait)
        delay = min(delay * 2, max_delay)

    raise ThrottledError("Microsoft 365 returned HTTP 429")
