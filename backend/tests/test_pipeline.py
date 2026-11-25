"""Normalization, checkpoint, and hybrid poll tests."""

from __future__ import annotations

import httpx
import pytest
import respx

from app.connectors.auth import MsalTokenProvider
from app.ingestion.pipeline import (
    IngestionPipeline,
    normalize_graph_alert,
    normalize_graph_incident,
    normalize_o365_audit,
    raw_payload_hash,
)
from app.ingestion.store import get_checkpoint, list_events
from app.timeutil import format_graph
from tests.conftest import FIXED_NOW, TENANT_ID


class _FakeMsalApp:
    def __init__(self):
        self.calls: list[list[str]] = []

    def acquire_token_for_client(self, scopes):
        self.calls.append(list(scopes))
        return {"access_token": f"token-{scopes[0]}", "expires_in": 3600}


def test_payload_hash_ignores_key_order():
    left = raw_payload_hash({"b": 1, "a": {"d": 2, "c": 3}})
    right = raw_payload_hash({"a": {"c": 3, "d": 2}, "b": 1})
    assert left == right
    assert len(left) == 64


def test_normalizes_graph_incident_alert_and_activity_records():
    incident = normalize_graph_incident(
        TENANT_ID,
        {
            "id": "inc-1",
            "displayName": "Mailbox compromise",
            "severity": "high",
            "assignedTo": "soc@contoso.com",
            "lastUpdateDateTime": "2026-11-17T11:30:00Z",
        },
    )
    assert incident.event_type == "security.incident"
    assert incident.actor == "soc@contoso.com"
    assert incident.resource == "Mailbox compromise"
    assert incident.severity == "high"
    assert incident.tenant_id == TENANT_ID

    alert = normalize_graph_alert(
        TENANT_ID,
        {
            "id": "alert-1",
            "title": "Suspicious inbox rule",
            "severity": "medium",
            "lastUpdateDateTime": "2026-11-17T11:40:00Z",
            "evidence": [
                {
                    "@odata.type": "#microsoft.graph.security.userEvidence",
                    "userAccount": {"userPrincipalName": "ada@contoso.com"},
                },
                {
                    "@odata.type": "#microsoft.graph.security.deviceEvidence",
                    "deviceDnsName": "laptop-1.contoso.com",
                },
            ],
        },
    )
    assert alert.actor == "ada@contoso.com"
    assert alert.device == "laptop-1.contoso.com"
    assert alert.resource == "Suspicious inbox rule"
    assert alert.event_type == "security.alert"

    samples = [
        ("Audit.Exchange", {"Id": "ex-1", "Workload": "Exchange", "Operation": "MailItemsAccessed", "UserId": "ada@contoso.com", "ClientIP": "203.0.113.10", "ObjectId": "inbox", "CreationTime": "2026-11-17T11:10:00Z"}, "audit.exchange.mailitemsaccessed", "203.0.113.10"),
        ("Audit.SharePoint", {"Id": "sp-1", "Workload": "OneDrive", "Operation": "FileAccessed", "UserId": "ada@contoso.com", "ClientIP": "203.0.113.11", "ObjectId": "https://contoso-my.sharepoint.com/file", "CreationTime": "2026-11-17T11:11:00Z"}, "audit.onedrive.fileaccessed", "203.0.113.11"),
        ("Audit.General", {"Id": "tm-1", "Workload": "MicrosoftTeams", "Operation": "MemberAdded", "UserId": "ada@contoso.com", "ClientIP": "203.0.113.12", "ObjectId": "team-1", "CreationTime": "2026-11-17T11:12:00Z"}, "audit.microsoftteams.memberadded", "203.0.113.12"),
        ("Audit.AzureActiveDirectory", {"Id": "ad-1", "Workload": "AzureActiveDirectory", "Operation": "UserLoggedIn", "UserId": "ada@contoso.com", "ClientIP": "203.0.113.13", "ObjectId": "user-1", "CreationTime": "2026-11-17T11:13:00Z"}, "audit.azureactivedirectory.userloggedin", "203.0.113.13"),
        ("DLP.All", {"Id": "dlp-1", "Workload": "SecurityComplianceCenter", "Operation": "DLPRuleMatch", "UserId": "ada@contoso.com", "ObjectId": "policy-1", "CreationTime": "2026-11-17T11:14:00Z"}, "audit.securitycompliancecenter.dlprulematch", None),
    ]
    for content_type, record, event_type, device in samples:
        event = normalize_o365_audit(TENANT_ID, content_type, record)
        assert event.event_type == event_type
        assert event.actor == "ada@contoso.com"
        assert event.device == device
        assert event.tenant_id == TENANT_ID
        assert event.feed_type == content_type
    assert normalize_o365_audit(TENANT_ID, "DLP.All", samples[-1][1]).severity == "medium"


@pytest.mark.asyncio
async def test_poll_advances_checkpoints_and_dedups_on_restart(runtime):
    apps: list[_FakeMsalApp] = []

    def factory(credentials):
        app = _FakeMsalApp()
        apps.append(app)
        return app

    incidents = [
        {
            "id": "inc-1",
            "displayName": "Phish",
            "severity": "high",
            "assignedTo": "soc@contoso.com",
            "lastUpdateDateTime": "2026-11-17T11:30:00Z",
        },
        {
            "id": "inc-2",
            "displayName": "Token theft",
            "severity": "critical",
            "assignedTo": "soc@contoso.com",
            "lastUpdateDateTime": "2026-11-17T11:45:00Z",
        },
    ]
    alert = {
        "id": "alert-9",
        "title": "Impossible travel",
        "severity": "high",
        "lastUpdateDateTime": "2026-11-17T11:35:00Z",
        "evidence": [],
    }
    record = {
        "Id": "mail-1",
        "Workload": "Exchange",
        "Operation": "MailItemsAccessed",
        "UserId": "ada@contoso.com",
        "ClientIP": "198.51.100.20",
        "ObjectId": "mbox",
        "CreationTime": "2026-11-17T11:20:00Z",
        "OrganizationId": "someone-else",
    }
    content_uri = f"https://manage.office.com/api/v1.0/{TENANT_ID}/activity/feed/audit/blob-1"
    blob = {
        "contentType": "Audit.Exchange",
        "contentId": "blob-1",
        "contentUri": content_uri,
    }
    incident_filters: list[str] = []

    def incidents_route(request: httpx.Request) -> httpx.Response:
        incident_filters.append(request.url.params["$filter"])
        page = incidents if len(incident_filters) == 1 else [incidents[1]]
        return httpx.Response(200, json={"value": page})

    def alerts_route(request: httpx.Request) -> httpx.Response:
        if request.url.params["$filter"].endswith("2026-11-17T10:59:59Z"):
            return httpx.Response(200, json={"value": [alert]})
        return httpx.Response(200, json={"value": []})

    def content_route(request: httpx.Request) -> httpx.Response:
        if request.url.params.get("contentType") == "Audit.Exchange":
            return httpx.Response(200, json=[blob])
        return httpx.Response(200, json=[])

    async with httpx.AsyncClient() as http:
        pipeline = IngestionPipeline(
            session_factory=runtime.sessions,
            secrets=runtime.secrets,
            tokens=MsalTokenProvider(app_factory=factory),
            http=http,
            settings=runtime.settings,
            clock=lambda: FIXED_NOW,
        )
        with respx.mock:
            respx.get("https://graph.microsoft.com/v1.0/security/incidents").mock(side_effect=incidents_route)
            respx.get("https://graph.microsoft.com/v1.0/security/alerts_v2").mock(side_effect=alerts_route)
            respx.get(url__regex=r".*/subscriptions/content.*").mock(side_effect=content_route)
            blob_route = respx.get(content_uri).mock(
                return_value=httpx.Response(200, json=[record])
            )
            first = await pipeline.poll_tenant(TENANT_ID)
            second = await pipeline.poll_tenant(TENANT_ID)

    by_feed = {item.feed_type: item for item in first.feeds}
    assert by_feed["incidents"].inserted == 2
    assert by_feed["incidents"].error is None
    assert by_feed["alerts_v2"].inserted == 1
    assert by_feed["Audit.Exchange"].inserted == 1
    assert by_feed["Audit.SharePoint"].inserted == 0
    assert by_feed["Audit.General"].inserted == 0
    assert by_feed["Audit.AzureActiveDirectory"].inserted == 0
    assert by_feed["DLP.All"].inserted == 0
    assert incident_filters[0] == "lastUpdateDateTime gt 2026-11-17T10:59:59Z"
    assert incident_filters[1] == "lastUpdateDateTime gt 2026-11-17T11:44:59Z"

    second_incidents = next(item for item in second.feeds if item.feed_type == "incidents")
    assert second_incidents.inserted == 0
    assert second_incidents.duplicates == 1
    stored = await list_events(runtime.sessions, tenant_id=TENANT_ID, limit=50)
    assert len(stored) == 4
    mail = next(item for item in stored if item.external_id == "mail-1")
    assert mail.tenant_id == TENANT_ID
    assert mail.actor == "ada@contoso.com"
    assert mail.device == "198.51.100.20"
    checkpoint = await get_checkpoint(runtime.sessions, TENANT_ID, "incidents")
    assert checkpoint is not None
    assert format_graph(checkpoint) == "2026-11-17T11:45:00Z"
    assert blob_route.call_count == 1
    requested = [call[0] for app in apps for call in app.calls]
    assert "https://graph.microsoft.com/.default" in requested
    assert "https://manage.office.com/.default" in requested
