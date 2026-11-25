"""Append-only, hash-chained audit log.

Each tenant has its own chain. ``record_hash`` is SHA-256 of the previous
record's hash plus the canonical JSON of this record. ``previous_hash`` for
the first record is 64 zero characters.

ORM update and delete events, including bulk ``UPDATE`` and ``DELETE``,
raise ``AuditImmutabilityError``. A forged ``previous_hash`` is rejected
before insert.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy import event, select
from sqlalchemy.orm import Mapper, Session
from sqlalchemy.orm.session import ORMExecuteState
from sqlalchemy.sql.dml import Delete, Update

from app.models.governance import AuditLog
from app.timeutil import format_graph, utcnow

GENESIS = "0" * 64
_REGISTERED = False


class AuditImmutabilityError(Exception):
    """Raised when code tries to update or delete an audit row."""


class AuditChainError(Exception):
    """Raised when a new audit row does not extend the tenant chain."""


def canonical_body(fields: dict[str, Any]) -> str:
    return json.dumps(fields, sort_keys=True, separators=(",", ":"))


def compute_record_hash(previous_hash: str, fields: dict[str, Any]) -> str:
    payload = previous_hash + canonical_body(fields)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def body_from_row(row: AuditLog) -> dict[str, Any]:
    return {
        "action": row.action,
        "actor": row.actor,
        "created_at": row.created_at,
        "previous_hash": row.previous_hash,
        "role": row.role,
        "sequence": row.sequence,
        "summary": row.summary,
        "target_id": row.target_id,
        "target_type": row.target_type,
        "tenant_id": row.tenant_id,
    }


def verify_chain(rows: list[AuditLog]) -> bool:
    """Return True when every record hash matches and links to the previous one."""
    ordered = sorted(rows, key=lambda row: row.sequence)
    previous = GENESIS
    expected_sequence = 1
    for row in ordered:
        if row.sequence != expected_sequence or row.previous_hash != previous:
            return False
        if compute_record_hash(row.previous_hash, body_from_row(row)) != row.record_hash:
            return False
        previous = row.record_hash
        expected_sequence += 1
    return True


async def append_audit(
    session,
    *,
    tenant_id: str,
    actor: str,
    role: str,
    action: str,
    target_type: str,
    target_id: str,
    summary: str,
) -> AuditLog:
    """Append one record. The summary must already be free of customer PII."""
    latest = await session.scalar(
        select(AuditLog)
        .where(AuditLog.tenant_id == tenant_id)
        .order_by(AuditLog.sequence.desc())
        .limit(1)
    )
    sequence = 1 if latest is None else latest.sequence + 1
    previous = GENESIS if latest is None else latest.record_hash
    created_at = format_graph(utcnow())
    fields = {
        "action": action,
        "actor": actor,
        "created_at": created_at,
        "previous_hash": previous,
        "role": role,
        "sequence": sequence,
        "summary": summary[:512],
        "target_id": target_id,
        "target_type": target_type,
        "tenant_id": tenant_id,
    }
    row = AuditLog(
        tenant_id=tenant_id,
        sequence=sequence,
        actor=actor,
        role=role,
        action=action,
        target_type=target_type,
        target_id=target_id,
        summary=fields["summary"],
        created_at=created_at,
        previous_hash=previous,
        record_hash=compute_record_hash(previous, fields),
    )
    session.add(row)
    await session.flush()
    return row


def _reject_mutation(*_args: object, **_kwargs: object) -> None:
    raise AuditImmutabilityError("audit_log is append-only")


def _reject_bulk(state: ORMExecuteState) -> None:
    if not (state.is_update or state.is_delete):
        return
    statement = state.statement
    if isinstance(statement, (Update, Delete)) and statement.table is not None:
        if statement.table.name == AuditLog.__tablename__:
            raise AuditImmutabilityError("audit_log is append-only")


def _guard_chain(mapper: Mapper, connection, target: AuditLog) -> None:
    latest = connection.execute(
        select(AuditLog.record_hash, AuditLog.sequence)
        .where(AuditLog.tenant_id == target.tenant_id)
        .order_by(AuditLog.sequence.desc())
        .limit(1)
    ).first()
    expected_previous = GENESIS if latest is None else latest.record_hash
    expected_sequence = 1 if latest is None else int(latest.sequence) + 1
    if target.previous_hash != expected_previous or target.sequence != expected_sequence:
        raise AuditChainError("audit record does not extend the tenant hash chain")
    if compute_record_hash(target.previous_hash, body_from_row(target)) != target.record_hash:
        raise AuditChainError("audit record hash does not match its contents")


def register_audit_immutability() -> None:
    """Install the listeners once. Safe to call from application startup."""
    global _REGISTERED
    if _REGISTERED:
        return
    event.listen(AuditLog, "before_update", _reject_mutation)
    event.listen(AuditLog, "before_delete", _reject_mutation)
    event.listen(AuditLog, "before_insert", _guard_chain)
    event.listen(Session, "do_orm_execute", _reject_bulk)
    _REGISTERED = True


register_audit_immutability()
