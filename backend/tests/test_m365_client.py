"""Graph poller, activity subscriptions, and content-blob fetch tests."""

from __future__ import annotations

import json

import httpx
import pytest
import respx

from app.connectors.m365_client import (
    O365_CONTENT_TYPES,
    GraphSecurityClient,
    M365ClientError,
    Office365ManagementClient,
)
from app.timeutil import parse_datetime
from tests.conftest import TENANT_ID

CHECKPOINT = parse_datetime("2026-11-17T11:00:00Z")


@pytest.mark.asyncio
async def test_incidents_follow_checkpoint_filter_and_next_link():
    first = {"id": "inc-1", "lastUpdateDateTime": "2026-11-17T11:30:00Z"}
    second = {"id": "inc-2", "lastUpdateDateTime": "2026-11-17T11:45:00Z"}

    def respond(request: httpx.Request) -> httpx.Response:
        if "skiptoken" in str(request.url):
            return httpx.Response(200, json={"value": [second]})
        assert request.url.params["$filter"] == "lastUpdateDateTime gt 2026-11-17T10:59:59Z"
        return httpx.Response(
            200,
            json={
                "value": [first],
                "@odata.nextLink": "https://graph.microsoft.com/v1.0/security/incidents?$skiptoken=page2",
            },
        )

    async with httpx.AsyncClient() as http:
        with respx.mock:
            respx.get(
                "https://graph.microsoft.com/v1.0/security/incidents",
            ).mock(side_effect=respond)
            client = GraphSecurityClient(http)
            rows = [item async for item in client.iter_incidents("token", CHECKPOINT)]
    assert [row["id"] for row in rows] == ["inc-1", "inc-2"]


@pytest.mark.asyncio
async def test_alerts_retry_429_then_return_the_page():
    delays: list[float] = []

    async def sleeper(seconds: float) -> None:
        delays.append(seconds)

    alert = {"id": "alert-1", "severity": "high", "lastUpdateDateTime": "2026-11-17T11:40:00Z"}
    async with httpx.AsyncClient() as http:
        with respx.mock:
            route = respx.get("https://graph.microsoft.com/v1.0/security/alerts_v2")
            route.side_effect = [
                httpx.Response(429, headers={"Retry-After": "0"}),
                httpx.Response(200, json={"value": [alert]}),
            ]
            client = GraphSecurityClient(http, sleeper=sleeper)
            rows = [item async for item in client.iter_alerts("token", CHECKPOINT)]
    assert rows == [alert]
    assert delays == [0.0]
    assert route.call_count == 2


@pytest.mark.asyncio
async def test_start_subscriptions_covers_every_workload():
    seen: list[str] = []

    def respond(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.params["contentType"])
        body = json.loads(request.content.decode())
        assert body["webhook"]["address"] == "https://hub.example.com/api/v1/webhooks/m365"
        assert body["webhook"]["authId"] == "expected-auth"
        assert request.url.params["PublisherIdentifier"] == TENANT_ID
        return httpx.Response(200, json={"status": "enabled"})

    async with httpx.AsyncClient() as http:
        with respx.mock:
            respx.post(url__regex=r"https://manage\.office\.com/api/v1\.0/.*/subscriptions/start.*").mock(
                side_effect=respond
            )
            client = Office365ManagementClient(http)
            started = await client.start_all(
                "token",
                TENANT_ID,
                webhook_url="https://hub.example.com/api/v1/webhooks/m365",
                auth_id="expected-auth",
            )
    assert seen == list(O365_CONTENT_TYPES)
    assert [item["status"] for item in started] == ["enabled"] * 5


@pytest.mark.asyncio
async def test_content_blobs_follow_next_page_uri_and_fetch_records():
    blob_page_2 = {
        "contentType": "Audit.Exchange",
        "contentId": "blob-2",
        "contentUri": f"https://manage.office.com/api/v1.0/{TENANT_ID}/activity/feed/audit/blob-2",
    }
    blob_page_1 = {
        "contentType": "Audit.Exchange",
        "contentId": "blob-1",
        "contentUri": f"https://manage.office.com/api/v1.0/{TENANT_ID}/activity/feed/audit/blob-1",
    }

    def list_content(request: httpx.Request) -> httpx.Response:
        if request.url.params.get("page") == "2":
            return httpx.Response(200, json=[blob_page_2])
        return httpx.Response(
            200,
            headers={
                "NextPageUri": (
                    "https://manage.office.com/api/v1.0/"
                    f"{TENANT_ID}/activity/feed/subscriptions/content?page=2"
                )
            },
            json=[blob_page_1],
        )

    async with httpx.AsyncClient() as http:
        with respx.mock:
            respx.get(url__regex=r".*/subscriptions/content.*").mock(side_effect=list_content)
            respx.get(url__regex=r".*/activity/feed/audit/blob-1").mock(
                return_value=httpx.Response(
                    200,
                    json=[{"Id": "rec-1", "Operation": "MailItemsAccessed", "Workload": "Exchange"}],
                )
            )
            client = Office365ManagementClient(http)
            blobs = await client.list_content(
                "token",
                TENANT_ID,
                "Audit.Exchange",
                CHECKPOINT,
                parse_datetime("2026-11-17T12:00:00Z"),
            )
            records = await client.fetch_blob("token", blobs[0]["contentUri"])
    assert [item["contentId"] for item in blobs] == ["blob-1", "blob-2"]
    assert records[0]["Id"] == "rec-1"


@pytest.mark.asyncio
async def test_content_uri_host_is_restricted():
    async with httpx.AsyncClient() as http:
        client = Office365ManagementClient(http)
        with pytest.raises(M365ClientError):
            await client.fetch_blob("token", "http://169.254.169.254/latest/meta-data")
        with pytest.raises(M365ClientError):
            await client.fetch_blob("token", "https://evil.example/secret")
        with pytest.raises(M365ClientError):
            await client.fetch_blob("token", "https://graph.microsoft.com/v1.0/users")
