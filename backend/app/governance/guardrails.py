"""PII masking and tenant role checks.

Telemetry that is about to leave the database for an LLM prompt is rewritten
to reversible placeholders. The original value is stored only as Fernet
ciphertext in a tenant-scoped vault, indexed by an HMAC so repeats reuse the
same token without keeping plaintext in the index.

API callers present ``X-Trinetra-Tenant``, ``X-Trinetra-Role``, and
``X-Trinetra-Subject``. Row reads are bound to that tenant. A path or query
tenant that does not match the caller is rejected.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
from typing import Annotated, Literal

from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, Header, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.governance import PiiVaultEntry
from app.timeutil import format_graph, utcnow

Role = Literal["SOC_ANALYST", "INCIDENT_COMMANDER", "ADMIN", "AUDITOR"]

PERMISSIONS: dict[str, frozenset[str]] = {
    "SOC_ANALYST": frozenset(
        {
            "events:read",
            "incidents:read",
            "incidents:read_sensitive",
            "ai:recommend",
            "tickets:read",
            "tickets:intake",
            "tickets:advance",
            "tickets:approve",
            "tickets:query",
        }
    ),
    "INCIDENT_COMMANDER": frozenset(
        {
            "events:read",
            "incidents:read",
            "incidents:read_sensitive",
            "ai:recommend",
            "incidents:approve",
            "incidents:remediate",
            "ingestion:run",
            "processing:run",
            "tickets:read",
            "tickets:intake",
            "tickets:advance",
            "tickets:approve",
            "tickets:query",
            "tickets:report",
        }
    ),
    "ADMIN": frozenset(
        {
            "events:read",
            "incidents:read",
            "incidents:read_sensitive",
            "ai:recommend",
            "incidents:approve",
            "incidents:remediate",
            "ingestion:run",
            "processing:run",
            "audit:read",
            "tickets:read",
            "tickets:intake",
            "tickets:advance",
            "tickets:approve",
            "tickets:query",
            "tickets:report",
        }
    ),
    "AUDITOR": frozenset(
        {"events:read", "incidents:read", "audit:read", "tickets:read", "tickets:report"}
    ),
}

_EMAIL = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")
_IPV4 = re.compile(
    r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b"
)
_IPV6 = re.compile(r"\b(?:[0-9A-Fa-f]{1,4}:){2,7}[0-9A-Fa-f]{1,4}\b")
_TOKEN = re.compile(r"\[(USER|IP|NAME|DOC)_\d{2,}\]")
_NAME_FIELDS = {"displayname", "display_name", "fullname", "full_name"}
_DOC_FIELDS = {"documenttitle", "document_title", "filename", "file_name", "document"}
_PREFIX = {"user": "USER", "ip": "IP", "name": "NAME", "doc": "DOC"}


class VaultKeyError(Exception):
    """The process has no usable Fernet key for the PII vault."""


class CanaryPolicyBlockedError(Exception):
    """A live remediation target is outside TRINETRA_LIVE_CANARY_TARGETS."""

    def __init__(self, action: str, target: str):
        self.action = action
        self.target = target
        super().__init__(
            f"Canary policy blocked {action}: the target is not in TRINETRA_LIVE_CANARY_TARGETS"
        )


_CANARY_ACTIONS = frozenset({"disableUser", "revokeSignInSessions", "isolateDevice"})


def assert_live_canary(settings, action: str, arguments: dict) -> None:
    """Block account and device changes when a live canary allowlist is set.

    An empty allowlist does not restrict live mode. ``patchIncident`` and GET
    verification stay available so status updates are not held hostage by the
    canary list. Mock mode never consults the list.
    """
    if getattr(settings, "execution_mode", "mock") != "live":
        return
    allowlist = getattr(settings, "live_canary_targets", frozenset())
    if not allowlist or action not in _CANARY_ACTIONS:
        return
    target = _canary_target(action, arguments)
    if target.casefold() not in allowlist:
        raise CanaryPolicyBlockedError(action, target)


def _canary_target(action: str, arguments: dict) -> str:
    if action == "isolateDevice":
        return str(arguments.get("deviceId") or "").strip()
    return str(arguments.get("userId") or "").strip()


class Principal:
    """Authenticated caller bound to one tenant and one role."""

    def __init__(self, subject: str, tenant_id: str, role: Role):
        self.subject = subject
        self.tenant_id = tenant_id
        self.role = role

    def allows(self, permission: str) -> bool:
        return permission in PERMISSIONS[self.role]


def _normalize_key(key: str) -> str:
    text = key.strip()
    try:
        decoded = base64.urlsafe_b64decode(text.encode("utf-8"))
    except Exception as exc:
        raise VaultKeyError("TRINETRA_VAULT_KEY must be a urlsafe Fernet key") from exc
    if len(decoded) != 32:
        raise VaultKeyError("TRINETRA_VAULT_KEY must decode to 32 bytes")
    Fernet(text.encode("utf-8"))
    return text


class PiiMasker:
    """Replace emails, IPs, display names, and document titles with vault tokens."""

    def __init__(self, key: str):
        normalized = _normalize_key(key)
        self._fernet = Fernet(normalized.encode("utf-8"))
        self._mac = base64.urlsafe_b64decode(normalized.encode("utf-8"))

    async def mask_telemetry(
        self,
        session: AsyncSession,
        tenant_id: str,
        payload: dict,
    ) -> dict:
        cloned = _copy(payload)
        await self._walk(session, tenant_id, cloned)
        return cloned

    async def restore(self, session: AsyncSession, tenant_id: str, text: str) -> str:
        """Reverse placeholders using only this tenant's vault rows."""
        pieces: list[str] = []
        cursor = 0
        for match in _TOKEN.finditer(text):
            pieces.append(text[cursor : match.start()])
            token = match.group(0)
            row = await session.scalar(
                select(PiiVaultEntry).where(
                    PiiVaultEntry.tenant_id == tenant_id,
                    PiiVaultEntry.token == token,
                )
            )
            if row is None:
                pieces.append(token)
            else:
                pieces.append(self._open(tenant_id, row.ciphertext, token))
            cursor = match.end()
        pieces.append(text[cursor:])
        return "".join(pieces)

    async def _walk(self, session: AsyncSession, tenant_id: str, node: object) -> None:
        if isinstance(node, dict):
            for key, value in list(node.items()):
                if isinstance(value, str):
                    node[key] = await self._mask_string(session, tenant_id, key, value)
                else:
                    await self._walk(session, tenant_id, value)
        elif isinstance(node, list):
            for index, value in enumerate(node):
                if isinstance(value, str):
                    node[index] = await self._mask_string(session, tenant_id, "", value)
                else:
                    await self._walk(session, tenant_id, value)

    async def _mask_string(
        self,
        session: AsyncSession,
        tenant_id: str,
        key: str,
        value: str,
    ) -> str:
        text = await self._replace_pattern(session, tenant_id, _EMAIL, value, "user")
        text = await self._replace_pattern(session, tenant_id, _IPV4, text, "ip")
        text = await self._replace_pattern(session, tenant_id, _IPV6, text, "ip")
        normalized = key.lower()
        if normalized in _NAME_FIELDS and text and not text.startswith("["):
            text = await self._token_for(session, tenant_id, "name", text)
        if normalized in _DOC_FIELDS and text and not text.startswith("["):
            text = await self._token_for(session, tenant_id, "doc", text)
        return text

    async def _replace_pattern(
        self,
        session: AsyncSession,
        tenant_id: str,
        pattern: re.Pattern[str],
        text: str,
        entity_type: str,
    ) -> str:
        parts: list[str] = []
        cursor = 0
        for match in pattern.finditer(text):
            parts.append(text[cursor : match.start()])
            parts.append(await self._token_for(session, tenant_id, entity_type, match.group(0)))
            cursor = match.end()
        parts.append(text[cursor:])
        return "".join(parts)

    async def _token_for(
        self,
        session: AsyncSession,
        tenant_id: str,
        entity_type: str,
        value: str,
    ) -> str:
        blind = hmac.new(
            self._mac,
            f"{tenant_id}|{entity_type}|{value}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        existing = await session.scalar(
            select(PiiVaultEntry).where(
                PiiVaultEntry.tenant_id == tenant_id,
                PiiVaultEntry.entity_type == entity_type,
                PiiVaultEntry.blind_index == blind,
            )
        )
        if existing is not None:
            return existing.token
        current = await session.scalar(
            select(func.max(PiiVaultEntry.token_number)).where(
                PiiVaultEntry.tenant_id == tenant_id,
                PiiVaultEntry.entity_type == entity_type,
            )
        )
        number = int(current or 0) + 1
        token = f"[{_PREFIX[entity_type]}_{number:02d}]"
        sealed = f"{tenant_id}\n{value}".encode("utf-8")
        ciphertext = self._fernet.encrypt(sealed).decode("utf-8")
        session.add(
            PiiVaultEntry(
                tenant_id=tenant_id,
                entity_type=entity_type,
                token=token,
                token_number=number,
                blind_index=blind,
                ciphertext=ciphertext,
                created_at=format_graph(utcnow()),
            )
        )
        await session.flush()
        return token

    def _open(self, tenant_id: str, ciphertext: str, token: str) -> str:
        """Decrypt only when the sealed prefix is this tenant. Otherwise keep the token."""
        try:
            opened = self._fernet.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
        except InvalidToken:
            return token
        prefix, separator, secret = opened.partition("\n")
        if separator != "\n" or prefix != tenant_id or secret == "":
            return token
        return secret


def build_masked_prompt(masked: dict, priority: str, score: int) -> str:
    """Recommendation text that is allowed to leave the service. It uses tokens only."""
    actor = masked.get("actor") or masked.get("userPrincipalName") or "[USER_unknown]"
    source_ip = masked.get("sourceIp") or masked.get("ClientIP") or "[IP_unknown]"
    name = masked.get("displayName") or "[NAME_unknown]"
    document = masked.get("documentTitle") or "[DOC_unknown]"
    return (
        f"Priority {priority} score {score}. "
        f"Review activity for {actor} ({name}) from {source_ip} involving {document}."
    )


async def get_principal(
    x_trinetra_tenant: Annotated[str | None, Header()] = None,
    x_trinetra_role: Annotated[str | None, Header()] = None,
    x_trinetra_subject: Annotated[str | None, Header()] = None,
) -> Principal:
    if not x_trinetra_tenant or not x_trinetra_role or not x_trinetra_subject:
        raise HTTPException(status_code=401, detail="authentication required")
    subject = x_trinetra_subject.strip()
    if not subject or len(subject) > 128 or "\n" in subject or "\r" in subject:
        raise HTTPException(status_code=401, detail="authentication required")
    if x_trinetra_role not in PERMISSIONS:
        raise HTTPException(status_code=403, detail="forbidden")
    try:
        from app.connectors.auth import validate_tenant_id

        tenant_id = validate_tenant_id(x_trinetra_tenant.strip())
    except ValueError:
        raise HTTPException(status_code=401, detail="authentication required") from None
    return Principal(subject=subject, tenant_id=tenant_id, role=x_trinetra_role)  # type: ignore[arg-type]


def require(permission: str):
    """FastAPI dependency that checks the caller's role."""

    async def _dependency(principal: Principal = Depends(get_principal)) -> Principal:
        if not principal.allows(permission):
            raise HTTPException(status_code=403, detail="forbidden")
        return principal

    return _dependency


def same_tenant(principal: Principal, tenant_id: str) -> None:
    """Reject a path or query tenant that is not the caller's tenant."""
    if tenant_id != principal.tenant_id:
        raise HTTPException(status_code=403, detail="forbidden")


def _copy(value: object) -> dict:
    if isinstance(value, dict):
        return {key: _copy_value(item) for key, item in value.items()}
    raise TypeError("telemetry payload must be an object")


def _copy_value(value: object) -> object:
    if isinstance(value, dict):
        return {key: _copy_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_copy_value(item) for item in value]
    return value
