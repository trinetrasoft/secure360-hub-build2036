"""Encrypted PII vault and the append-only audit chain."""

from __future__ import annotations

from sqlalchemy import Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.security import Base, new_id


class PiiVaultEntry(Base):
    """Tenant-scoped reversible token. The plaintext is stored only as ciphertext."""

    __tablename__ = "pii_vault"
    __table_args__ = (
        UniqueConstraint("tenant_id", "entity_type", "blind_index", name="uq_pii_blind_index"),
        UniqueConstraint("tenant_id", "token", name="uq_pii_token"),
        Index("ix_pii_vault_tenant", "tenant_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(16), nullable=False)
    token: Mapped[str] = mapped_column(String(32), nullable=False)
    token_number: Mapped[int] = mapped_column(Integer, nullable=False)
    blind_index: Mapped[str] = mapped_column(String(64), nullable=False)
    ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(String(32), nullable=False)


class AuditLog(Base):
    """Tamper-evident audit record. Updates and deletes are rejected."""

    __tablename__ = "audit_log"
    __table_args__ = (
        UniqueConstraint("tenant_id", "sequence", name="uq_audit_sequence"),
        Index("ix_audit_tenant_sequence", "tenant_id", "sequence"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    actor: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    target_type: Mapped[str] = mapped_column(String(64), nullable=False)
    target_id: Mapped[str] = mapped_column(String(64), nullable=False)
    summary: Mapped[str] = mapped_column(String(512), nullable=False)
    created_at: Mapped[str] = mapped_column(String(32), nullable=False)
    previous_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    record_hash: Mapped[str] = mapped_column(String(64), nullable=False)
