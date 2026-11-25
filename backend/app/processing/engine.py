"""Deduplicate, correlate, and score Microsoft 365 signals.

The fingerprint is SHA-256 of ``tenant_id|provider|provider_alert_id|timestamp_bucket``.
The bucket is the UTC epoch minute, so the same provider alert in the same
minute collapses to one signal and a later minute can still join an incident.

Correlation uses a 15-minute sliding window. Two clusters are linked when they
share a user principal, a source IP, or a managed device id and the gap between
their time spans is at most 15 minutes. Links are transitive, so a chain of
overlapping pairs becomes one ``CorrelatedIncident``.
"""

from __future__ import annotations

import hashlib
import ipaddress
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.processing import CorrelatedIncident, EventFingerprint, IncidentSignal
from app.models.security import CanonicalSecurityEvent
from app.timeutil import ensure_utc, format_graph, parse_datetime, utcnow

WINDOW = timedelta(minutes=15)
BUCKET_SECONDS = 60

SEVERITY_WEIGHT = {
    "critical": 70,
    "high": 50,
    "medium": 30,
    "low": 15,
    "informational": 5,
}


@dataclass(frozen=True)
class SecuritySignal:
    tenant_id: str
    provider: str
    provider_alert_id: str
    occurred_at: datetime
    severity: str
    user_principal_name: str | None = None
    source_ip: str | None = None
    device_id: str | None = None
    event_id: str | None = None

    @property
    def fingerprint(self) -> str:
        return event_fingerprint(
            self.tenant_id,
            self.provider,
            self.provider_alert_id,
            self.occurred_at,
        )

    @property
    def bucket(self) -> int:
        return timestamp_bucket(self.occurred_at)


@dataclass(frozen=True)
class RiskAssessment:
    score: int
    priority: str
    label: str
    sla_minutes: int


@dataclass
class Cluster:
    signals: list[SecuritySignal] = field(default_factory=list)
    incident_id: str | None = None
    opened_at: str | None = None
    sla_due_at: str | None = None

    @property
    def start(self) -> datetime:
        return min(ensure_utc(signal.occurred_at) for signal in self.signals)

    @property
    def end(self) -> datetime:
        return max(ensure_utc(signal.occurred_at) for signal in self.signals)

    def principals(self) -> set[str]:
        return {signal.user_principal_name for signal in self.signals if signal.user_principal_name}

    def ips(self) -> set[str]:
        return {signal.source_ip for signal in self.signals if signal.source_ip}

    def devices(self) -> set[str]:
        return {signal.device_id for signal in self.signals if signal.device_id}


@dataclass(frozen=True)
class IncidentSnapshot:
    id: str
    tenant_id: str
    risk_score: int
    priority: str
    priority_label: str
    sla_minutes: int
    sla_due_at: str
    status: str
    signal_count: int
    window_start: str
    window_end: str
    user_principal_names: tuple[str, ...]
    source_ips: tuple[str, ...]
    device_ids: tuple[str, ...]


@dataclass(frozen=True)
class ProcessSummary:
    tenant_id: str
    considered: int
    duplicates: int
    incidents: tuple[IncidentSnapshot, ...]


def timestamp_bucket(value: datetime) -> int:
    """UTC epoch minute that the fingerprint uses as ``timestamp_bucket``."""
    return int(ensure_utc(value).timestamp()) // BUCKET_SECONDS


def event_fingerprint(
    tenant_id: str,
    provider: str,
    provider_alert_id: str,
    occurred_at: datetime,
) -> str:
    material = f"{tenant_id}|{provider}|{provider_alert_id}|{timestamp_bucket(occurred_at)}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def priority_for(score: int) -> RiskAssessment:
    """Map a 0–100 score onto the P1 / P2 / P3 SLA table."""
    bounded = max(0, min(100, int(score)))
    if bounded >= 80:
        return RiskAssessment(bounded, "P1", "CRITICAL", 15)
    if bounded >= 40:
        return RiskAssessment(bounded, "P2", "HIGH/MEDIUM", 120)
    return RiskAssessment(bounded, "P3", "LOW/ROUTINE", 24 * 60)


def assess_risk(signals: list[SecuritySignal]) -> RiskAssessment:
    """Score a cluster. More severe signals, more key types, and more volume raise it."""
    if not signals:
        return priority_for(0)
    base = max(SEVERITY_WEIGHT.get(signal.severity, 5) for signal in signals)
    kinds = 0
    if any(signal.user_principal_name for signal in signals):
        kinds += 1
    if any(signal.source_ip for signal in signals):
        kinds += 1
    if any(signal.device_id for signal in signals):
        kinds += 1
    diversity = 15 if kinds >= 2 else 0
    if kinds == 3:
        diversity += 15
    volume = min(max(len(signals) - 1, 0), 5) * 4
    return priority_for(min(100, base + diversity + volume))


def merge_clusters(clusters: list[Cluster], *, window: timedelta = WINDOW) -> list[Cluster]:
    """Union clusters that share an identity key inside the sliding window."""
    if not clusters:
        return []
    parent = list(range(len(clusters)))

    def find(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(left: int, right: int) -> None:
        root_left, root_right = find(left), find(right)
        if root_left != root_right:
            parent[root_right] = root_left

    for left in range(len(clusters)):
        for right in range(left + 1, len(clusters)):
            if _share_key(clusters[left], clusters[right]) and _within_window(
                clusters[left], clusters[right], window
            ):
                union(left, right)

    grouped: dict[int, list[Cluster]] = defaultdict(list)
    for index, cluster in enumerate(clusters):
        grouped[find(index)].append(cluster)

    merged: list[Cluster] = []
    for group in grouped.values():
        seen: set[str] = set()
        signals: list[SecuritySignal] = []
        for cluster in group:
            for signal in cluster.signals:
                if signal.fingerprint in seen:
                    continue
                seen.add(signal.fingerprint)
                signals.append(signal)
        incident_id = next((cluster.incident_id for cluster in group if cluster.incident_id), None)
        opened = min((cluster.opened_at for cluster in group if cluster.opened_at), default=None)
        due = min((cluster.sla_due_at for cluster in group if cluster.sla_due_at), default=None)
        merged.append(
            Cluster(signals=signals, incident_id=incident_id, opened_at=opened, sla_due_at=due)
        )
    return merged


def signal_from_event(row: CanonicalSecurityEvent) -> SecuritySignal:
    raw = row.raw_payload if isinstance(row.raw_payload, dict) else {}
    actor = _clean(row.actor)
    upn = actor if _is_email(actor) else _first(raw, "userPrincipalName", "UserId", "userId")
    if upn and not _is_email(upn):
        upn = None
    device = _clean(row.device)
    source_ip = _first(raw, "ClientIP", "clientIp", "ipAddress", "sourceIp")
    if source_ip and not _is_ip(source_ip):
        source_ip = None
    if source_ip is None and _is_ip(device):
        source_ip = device
    device_id = _first(raw, "deviceId", "DeviceId", "managedDeviceId", "aadDeviceId")
    if device_id is None and device and not _is_ip(device) and not _is_email(device):
        device_id = device
    occurred = row.occurred_at or row.ingested_at
    return SecuritySignal(
        tenant_id=row.tenant_id,
        provider=row.source,
        provider_alert_id=row.external_id,
        occurred_at=ensure_utc(occurred),
        severity=row.severity,
        user_principal_name=upn,
        source_ip=source_ip,
        device_id=device_id,
        event_id=row.id,
    )


class ProcessingEngine:
    """Read stored canonical events and write deduped, scored incidents."""

    async def process_tenant(
        self,
        sessions: async_sessionmaker[AsyncSession],
        tenant_id: str,
    ) -> ProcessSummary:
        async with sessions() as session:
            async with session.begin():
                rows = (
                    await session.scalars(
                        select(CanonicalSecurityEvent)
                        .where(CanonicalSecurityEvent.tenant_id == tenant_id)
                        .order_by(CanonicalSecurityEvent.occurred_at)
                    )
                ).all()
                fresh: list[SecuritySignal] = []
                duplicates = 0
                for row in rows:
                    signal = signal_from_event(row)
                    existing = await session.scalar(
                        select(EventFingerprint.id).where(
                            EventFingerprint.tenant_id == tenant_id,
                            EventFingerprint.fingerprint == signal.fingerprint,
                        )
                    )
                    if existing is not None:
                        duplicates += 1
                        continue
                    session.add(
                        EventFingerprint(
                            tenant_id=tenant_id,
                            fingerprint=signal.fingerprint,
                            provider=signal.provider,
                            provider_alert_id=signal.provider_alert_id,
                            timestamp_bucket=signal.bucket,
                            event_id=signal.event_id,
                        )
                    )
                    fresh.append(signal)

                open_incidents = (
                    await session.scalars(
                        select(CorrelatedIncident).where(
                            CorrelatedIncident.tenant_id == tenant_id,
                            CorrelatedIncident.status == "open",
                        )
                    )
                ).all()
                clusters = [await _cluster_from_incident(session, incident) for incident in open_incidents]
                clusters.extend(Cluster(signals=[signal]) for signal in fresh)
                merged = merge_clusters(clusters)
                snapshots: list[IncidentSnapshot] = []
                for cluster in merged:
                    if not _cluster_has_fresh_signal(cluster, fresh):
                        continue
                    snapshots.append(await _save_cluster(session, tenant_id, cluster))
                return ProcessSummary(
                    tenant_id=tenant_id,
                    considered=len(rows),
                    duplicates=duplicates,
                    incidents=tuple(snapshots),
                )


def _cluster_has_fresh_signal(cluster: Cluster, fresh: list[SecuritySignal]) -> bool:
    fresh_ids = {signal.fingerprint for signal in fresh}
    return any(signal.fingerprint in fresh_ids for signal in cluster.signals)


async def _cluster_from_incident(session: AsyncSession, incident: CorrelatedIncident) -> Cluster:
    rows = (
        await session.scalars(
            select(IncidentSignal).where(IncidentSignal.incident_id == incident.id)
        )
    ).all()
    signals = [
        SecuritySignal(
            tenant_id=row.tenant_id,
            provider=row.provider,
            provider_alert_id=row.provider_alert_id,
            occurred_at=parse_datetime(row.occurred_at),
            severity=row.severity,
            user_principal_name=row.user_principal_name,
            source_ip=row.source_ip,
            device_id=row.device_id,
            event_id=row.event_id,
        )
        for row in rows
    ]
    return Cluster(
        signals=signals,
        incident_id=incident.id,
        opened_at=incident.opened_at,
        sla_due_at=incident.sla_due_at,
    )


async def _save_cluster(
    session: AsyncSession,
    tenant_id: str,
    cluster: Cluster,
) -> IncidentSnapshot:
    assessment = assess_risk(cluster.signals)
    now = utcnow().replace(microsecond=0)
    opened = cluster.opened_at or format_graph(now)
    due = format_graph(parse_datetime(opened) + timedelta(minutes=assessment.sla_minutes))
    if cluster.sla_due_at and cluster.sla_due_at < due:
        due = cluster.sla_due_at
    principals = sorted(cluster.principals())
    ips = sorted(cluster.ips())
    devices = sorted(cluster.devices())
    window_start = format_graph(cluster.start)
    window_end = format_graph(cluster.end)
    if cluster.incident_id is None:
        incident = CorrelatedIncident(
            tenant_id=tenant_id,
            risk_score=assessment.score,
            priority=assessment.priority,
            priority_label=assessment.label,
            sla_minutes=assessment.sla_minutes,
            sla_due_at=due,
            status="open",
            window_start=window_start,
            window_end=window_end,
            user_principal_names=principals,
            source_ips=ips,
            device_ids=devices,
            opened_at=opened,
        )
        session.add(incident)
        await session.flush()
        incident_id = incident.id
    else:
        incident_id = cluster.incident_id
        incident = await session.get(CorrelatedIncident, incident_id)
        if incident is None:
            raise RuntimeError("correlated incident disappeared during processing")
        incident.risk_score = assessment.score
        incident.priority = assessment.priority
        incident.priority_label = assessment.label
        incident.sla_minutes = assessment.sla_minutes
        incident.sla_due_at = due
        incident.window_start = window_start
        incident.window_end = window_end
        incident.user_principal_names = principals
        incident.source_ips = ips
        incident.device_ids = devices

    existing_fps = set(
        (
            await session.scalars(
                select(IncidentSignal.fingerprint).where(IncidentSignal.incident_id == incident_id)
            )
        ).all()
    )
    for signal in cluster.signals:
        if signal.fingerprint in existing_fps:
            continue
        session.add(
            IncidentSignal(
                incident_id=incident_id,
                tenant_id=tenant_id,
                fingerprint=signal.fingerprint,
                event_id=signal.event_id,
                provider=signal.provider,
                provider_alert_id=signal.provider_alert_id,
                occurred_at=format_graph(signal.occurred_at),
                severity=signal.severity,
                user_principal_name=signal.user_principal_name,
                source_ip=signal.source_ip,
                device_id=signal.device_id,
            )
        )
    return IncidentSnapshot(
        id=incident_id,
        tenant_id=tenant_id,
        risk_score=assessment.score,
        priority=assessment.priority,
        priority_label=assessment.label,
        sla_minutes=assessment.sla_minutes,
        sla_due_at=due,
        status="open",
        signal_count=len(cluster.signals),
        window_start=window_start,
        window_end=window_end,
        user_principal_names=tuple(principals),
        source_ips=tuple(ips),
        device_ids=tuple(devices),
    )


def _share_key(left: Cluster, right: Cluster) -> bool:
    return bool(
        left.principals() & right.principals()
        or left.ips() & right.ips()
        or left.devices() & right.devices()
    )


def _within_window(left: Cluster, right: Cluster, window: timedelta) -> bool:
    if left.end < right.start:
        return right.start - left.end <= window
    if right.end < left.start:
        return left.start - right.end <= window
    return True


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None


def _first(raw: dict, *keys: str) -> str | None:
    for key in keys:
        value = raw.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _is_email(value: str | None) -> bool:
    return bool(value and "@" in value and "." in value.split("@")[-1])


def _is_ip(value: str | None) -> bool:
    if not value:
        return False
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return False
    return True
