"""PII vault redaction and tenant role checks."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.governance.guardrails import PiiMasker, VaultKeyError
from app.models.governance import PiiVaultEntry
from app.models.security import CanonicalSecurityEvent
from tests.conftest import TENANT_ID

OTHER_TENANT = "33333333-3333-3333-3333-333333333333"
EMAIL = "ada.lovelace@contoso.com"
OTHER_EMAIL = "grace@fabrikam.com"


def _headers(role: str, tenant: str = TENANT_ID, subject: str = "operator-1") -> dict[str, str]:
    return {
        "X-Trinetra-Tenant": tenant,
        "X-Trinetra-Role": role,
        "X-Trinetra-Subject": subject,
    }


def test_missing_or_invalid_vault_key_fails_closed():
    with pytest.raises(VaultKeyError):
        PiiMasker("not-a-fernet-key")


@pytest.mark.asyncio
async def test_pii_tokens_round_trip_and_stay_inside_the_tenant(runtime):
    key = runtime.settings.vault_key.get_secret_value()
    masker = PiiMasker(key)
    payload = {
        "userPrincipalName": EMAIL,
        "note": f"mailbox {EMAIL} was read from 203.0.113.44",
        "displayName": "Ada Lovelace",
        "documentTitle": "Board Pack Q4.docx",
        "nested": ["also ada.lovelace@contoso.com"],
    }
    async with runtime.sessions() as session:
        async with session.begin():
            masked = await masker.mask_telemetry(session, TENANT_ID, payload)
            restored = await masker.restore(
                session,
                TENANT_ID,
                masked["userPrincipalName"],
            )
            other = await masker.restore(session, OTHER_TENANT, masked["userPrincipalName"])
            await masker.mask_telemetry(
                session,
                OTHER_TENANT,
                {"userPrincipalName": OTHER_EMAIL},
            )
            other_own = await masker.restore(session, OTHER_TENANT, "[USER_01]")
            rows = (
                await session.scalars(select(PiiVaultEntry).where(PiiVaultEntry.tenant_id == TENANT_ID))
            ).all()

    assert EMAIL not in str(masked)
    assert "203.0.113.44" not in str(masked)
    assert "Ada Lovelace" not in str(masked)
    assert "Board Pack Q4.docx" not in str(masked)
    assert masked["userPrincipalName"] == "[USER_01]"
    assert masked["nested"] == ["also [USER_01]"]
    assert "[IP_01]" in masked["note"]
    assert masked["displayName"] == "[NAME_01]"
    assert masked["documentTitle"] == "[DOC_01]"
    assert restored == EMAIL
    assert other == "[USER_01]"
    assert other_own == OTHER_EMAIL
    assert rows
    for row in rows:
        assert EMAIL not in row.ciphertext
        assert "Ada Lovelace" not in row.ciphertext
        assert row.blind_index != EMAIL


@pytest.mark.asyncio
async def test_roles_filter_tenants_and_hide_identifiers(api, runtime):
    client, _runtime = api
    occurred = datetime(2026, 11, 17, 12, 0, tzinfo=timezone.utc)
    async with runtime.sessions() as session:
        async with session.begin():
            session.add(
                CanonicalSecurityEvent(
                    source="microsoft_graph_security",
                    tenant_id=TENANT_ID,
                    event_type="security.alert",
                    external_id="visible-alert",
                    actor=EMAIL,
                    device="device-9",
                    resource="https://contoso.sharepoint.com/board",
                    severity="low",
                    feed_type="alerts_v2",
                    occurred_at=occurred,
                    raw_payload_hash="cd" * 32,
                    raw_payload={},
                    ingested_at=occurred,
                )
            )

    health = await client.get("/api/v1/health")
    assert health.status_code == 200
    missing = await client.post(f"/api/v1/ingestion/tenants/{TENANT_ID}/poll")
    assert missing.status_code == 401
    analyst = await client.post(
        f"/api/v1/ingestion/tenants/{TENANT_ID}/poll",
        headers=_headers("SOC_ANALYST"),
    )
    assert analyst.status_code == 403
    crossed = await client.get(
        "/api/v1/events",
        headers=_headers("SOC_ANALYST", tenant=OTHER_TENANT),
    )
    assert crossed.status_code == 200
    assert crossed.json() == []
    mismatch = await client.get(
        "/api/v1/events",
        params={"tenant_id": TENANT_ID},
        headers=_headers("SOC_ANALYST", tenant=OTHER_TENANT),
    )
    assert mismatch.status_code == 403
    bad_role = await client.get("/api/v1/events", headers=_headers("ROOT"))
    assert bad_role.status_code == 403

    auditor = await client.get("/api/v1/events", headers=_headers("AUDITOR", subject="auditor-1"))
    assert auditor.status_code == 200
    body = auditor.json()
    assert len(body) == 1
    assert body[0]["actor"] is None
    assert body[0]["device"] is None
    assert body[0]["resource"] is None
    assert EMAIL not in auditor.text

    analyst_events = await client.get(
        "/api/v1/events",
        headers=_headers("SOC_ANALYST", subject="analyst-1"),
    )
    assert analyst_events.json()[0]["actor"] == EMAIL

    recommend = await client.post(
        "/api/v1/incidents/missing/recommend",
        headers=_headers("AUDITOR"),
    )
    assert recommend.status_code == 403
