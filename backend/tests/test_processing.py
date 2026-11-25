"""Dedup fingerprints, the 15-minute correlation window, and SLA bands."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.models.security import CanonicalSecurityEvent
from app.processing.engine import (
    ProcessingEngine,
    SecuritySignal,
    assess_risk,
    event_fingerprint,
    merge_clusters,
    priority_for,
)
from app.processing.engine import Cluster
from tests.conftest import TENANT_ID

OTHER_TENANT = "33333333-3333-3333-3333-333333333333"
BASE = datetime(2026, 11, 17, 12, 0, tzinfo=timezone.utc)


def _signal(
    minutes: float,
    *,
    tenant: str = TENANT_ID,
    alert: str | None = None,
    severity: str = "high",
    upn: str | None = None,
    ip: str | None = None,
    device: str | None = None,
) -> SecuritySignal:
    return SecuritySignal(
        tenant_id=tenant,
        provider="microsoft_graph_security",
        provider_alert_id=alert or f"alert-{minutes}-{upn}-{ip}-{device}",
        occurred_at=BASE + timedelta(minutes=minutes),
        severity=severity,
        user_principal_name=upn,
        source_ip=ip,
        device_id=device,
    )


async def _store_event(
    runtime,
    *,
    external_id: str,
    minutes: float,
    severity: str = "high",
    actor: str | None = None,
    device: str | None = None,
    raw: dict | None = None,
    tenant: str = TENANT_ID,
) -> None:
    occurred = BASE + timedelta(minutes=minutes)
    async with runtime.sessions() as session:
        async with session.begin():
            session.add(
                CanonicalSecurityEvent(
                    source="microsoft_graph_security",
                    tenant_id=tenant,
                    event_type="security.alert",
                    external_id=external_id,
                    actor=actor,
                    device=device,
                    resource=None,
                    severity=severity,
                    feed_type="alerts_v2",
                    occurred_at=occurred,
                    raw_payload_hash="ab" * 32,
                    raw_payload=raw or {},
                    ingested_at=occurred,
                )
            )


def test_fingerprint_is_stable_inside_one_minute_and_changes_after():
    early = BASE.replace(second=10)
    late = BASE.replace(second=50)
    nxt = BASE + timedelta(minutes=1)
    first = event_fingerprint(TENANT_ID, "microsoft_graph_security", "alert-1", early)
    second = event_fingerprint(TENANT_ID, "microsoft_graph_security", "alert-1", late)
    third = event_fingerprint(TENANT_ID, "microsoft_graph_security", "alert-1", nxt)
    assert first == second
    assert first != third
    assert len(first) == 64


def test_sliding_window_edges_and_transitive_chain():
    shared = "ada@contoso.com"
    inside = merge_clusters(
        [
            Cluster(signals=[_signal(0, upn=shared, alert="a")]),
            Cluster(signals=[_signal(15, upn=shared, alert="b")]),
        ]
    )
    outside = merge_clusters(
        [
            Cluster(signals=[_signal(0, upn=shared, alert="a")]),
            Cluster(signals=[_signal(15 + 1 / 60, upn=shared, alert="b")]),
        ]
    )
    chain = merge_clusters(
        [
            Cluster(signals=[_signal(0, upn=shared, alert="a")]),
            Cluster(signals=[_signal(10, upn=shared, ip="203.0.113.10", alert="b")]),
            Cluster(signals=[_signal(20, ip="203.0.113.10", alert="c")]),
        ]
    )
    unrelated = merge_clusters(
        [
            Cluster(signals=[_signal(0, upn="one@contoso.com", alert="a")]),
            Cluster(signals=[_signal(1, upn="two@contoso.com", alert="b")]),
        ]
    )
    assert len(inside) == 1
    assert len(outside) == 2
    assert len(chain) == 1
    assert len(chain[0].signals) == 3
    assert len(unrelated) == 2


def test_priority_bands_and_score_composition():
    assert priority_for(100).priority == "P1"
    assert priority_for(100).score == 100
    assert priority_for(80).priority == "P1"
    assert priority_for(80).label == "CRITICAL"
    assert priority_for(80).sla_minutes == 15
    assert priority_for(79).priority == "P2"
    assert priority_for(79).label == "HIGH/MEDIUM"
    assert priority_for(79).sla_minutes == 120
    assert priority_for(40).priority == "P2"
    assert priority_for(40).sla_minutes == 120
    assert priority_for(39).priority == "P3"
    assert priority_for(39).label == "LOW/ROUTINE"
    assert priority_for(39).sla_minutes == 24 * 60

    critical = assess_risk([_signal(0, severity="critical", alert="c")])
    assert critical.score == 70
    assert critical.priority == "P2"
    high = assess_risk(
        [_signal(0, severity="high", upn="ada@contoso.com", ip="203.0.113.8", device="device-1")]
    )
    assert high.score == 80
    assert high.priority == "P1"
    medium = assess_risk([_signal(0, severity="medium", alert="m")])
    assert medium.score == 30
    assert medium.priority == "P3"
    capped = assess_risk(
        [
            _signal(index, severity="critical", upn="ada@contoso.com", ip="203.0.113.8", device="device-1", alert=str(index))
            for index in range(8)
        ]
    )
    assert capped.score == 100


@pytest.mark.asyncio
async def test_engine_dedups_and_correlates_per_tenant(runtime):
    await _store_event(
        runtime,
        external_id="alert-a",
        minutes=0,
        severity="high",
        actor="ada@contoso.com",
        raw={"ClientIP": "203.0.113.10", "deviceId": "device-7"},
    )
    await _store_event(
        runtime,
        external_id="alert-b",
        minutes=10,
        severity="medium",
        actor="ada@contoso.com",
    )
    await _store_event(
        runtime,
        external_id="alert-other",
        minutes=1,
        severity="low",
        actor="ada@contoso.com",
        tenant=OTHER_TENANT,
    )
    engine = ProcessingEngine()
    first = await engine.process_tenant(runtime.sessions, TENANT_ID)
    assert first.considered == 2
    assert first.duplicates == 0
    assert len(first.incidents) == 1
    incident = first.incidents[0]
    assert incident.signal_count == 2
    assert incident.priority == "P1"
    assert incident.sla_minutes == 15
    assert incident.user_principal_names == ("ada@contoso.com",)
    assert "203.0.113.10" in incident.source_ips

    second = await engine.process_tenant(runtime.sessions, TENANT_ID)
    assert second.considered == 2
    assert second.duplicates == 2
    assert second.incidents == ()

    other = await engine.process_tenant(runtime.sessions, OTHER_TENANT)
    assert len(other.incidents) == 1
    assert other.incidents[0].id != incident.id
    assert other.incidents[0].priority == "P3"
