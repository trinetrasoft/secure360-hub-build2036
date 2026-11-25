"""Response models for correlation, recommendations, and the audit chain."""

from __future__ import annotations

from pydantic import BaseModel, Field


class IncidentView(BaseModel):
    id: str
    tenant_id: str
    risk_score: int
    priority: str
    priority_label: str
    sla_minutes: int
    sla_due_at: str
    status: str
    window_start: str
    window_end: str
    signal_count: int
    user_principal_names: list[str] = Field(default_factory=list)
    source_ips: list[str] = Field(default_factory=list)
    device_ids: list[str] = Field(default_factory=list)


class ProcessView(BaseModel):
    tenant_id: str
    considered: int
    duplicates: int
    incidents: list[IncidentView]


class RecommendationView(BaseModel):
    incident_id: str
    prompt: str


class RemediationBody(BaseModel):
    action: str


class AuditRecordView(BaseModel):
    sequence: int
    actor: str
    role: str
    action: str
    target_type: str
    target_id: str
    summary: str
    created_at: str
    previous_hash: str
    record_hash: str
