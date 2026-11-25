"""HTTP 429 backoff tests."""

from __future__ import annotations

from email.utils import formatdate

import httpx
import pytest
import respx

from app.connectors.retry import ThrottledError, request_with_backoff


@pytest.mark.asyncio
async def test_retry_after_header_is_honored():
    delays: list[float] = []

    async def sleeper(seconds: float) -> None:
        delays.append(seconds)

    async with httpx.AsyncClient() as client:
        with respx.mock:
            route = respx.get("https://graph.microsoft.com/v1.0/security/incidents")
            route.side_effect = [
                httpx.Response(429, headers={"Retry-After": "7"}),
                httpx.Response(200, json={"value": []}),
            ]
            response = await request_with_backoff(
                client,
                "GET",
                "https://graph.microsoft.com/v1.0/security/incidents",
                sleeper=sleeper,
            )
    assert response.status_code == 200
    assert delays == [7.0]
    assert route.call_count == 2


@pytest.mark.asyncio
async def test_missing_retry_after_uses_exponential_backoff():
    delays: list[float] = []

    async def sleeper(seconds: float) -> None:
        delays.append(seconds)

    async with httpx.AsyncClient() as client:
        with respx.mock:
            route = respx.get("https://manage.office.com/api/v1.0/content")
            route.side_effect = [
                httpx.Response(429),
                httpx.Response(429),
                httpx.Response(200, json=[]),
            ]
            response = await request_with_backoff(
                client,
                "GET",
                "https://manage.office.com/api/v1.0/content",
                sleeper=sleeper,
            )
    assert response.status_code == 200
    assert delays == [1.0, 2.0]


@pytest.mark.asyncio
async def test_retry_after_http_date_is_parsed(monkeypatch):
    delays: list[float] = []

    async def sleeper(seconds: float) -> None:
        delays.append(seconds)

    http_date = formatdate(usegmt=True)
    async with httpx.AsyncClient() as client:
        with respx.mock:
            route = respx.get("https://graph.microsoft.com/v1.0/security/alerts_v2")
            route.side_effect = [
                httpx.Response(429, headers={"Retry-After": http_date}),
                httpx.Response(200, json={"value": []}),
            ]
            response = await request_with_backoff(
                client,
                "GET",
                "https://graph.microsoft.com/v1.0/security/alerts_v2",
                sleeper=sleeper,
            )
    assert response.status_code == 200
    assert delays and delays[0] < 5


@pytest.mark.asyncio
async def test_exhausted_429_raises_and_other_errors_are_not_retried():
    delays: list[float] = []

    async def sleeper(seconds: float) -> None:
        delays.append(seconds)

    async with httpx.AsyncClient() as client:
        with respx.mock:
            route = respx.get("https://graph.microsoft.com/v1.0/security/incidents")
            route.side_effect = [httpx.Response(429), httpx.Response(429)]
            with pytest.raises(ThrottledError):
                await request_with_backoff(
                    client,
                    "GET",
                    "https://graph.microsoft.com/v1.0/security/incidents",
                    max_attempts=2,
                    sleeper=sleeper,
                )
    assert delays == [1.0]

    async with httpx.AsyncClient() as client:
        with respx.mock:
            route = respx.get("https://graph.microsoft.com/v1.0/security/alerts_v2")
            route.side_effect = [httpx.Response(500), httpx.Response(200, json={"value": []})]
            response = await request_with_backoff(
                client,
                "GET",
                "https://graph.microsoft.com/v1.0/security/alerts_v2",
                sleeper=sleeper,
            )
    assert response.status_code == 500
    assert route.call_count == 1
