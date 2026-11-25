"""Shared fixtures for the Microsoft 365 ingestion tests."""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from app.config import Settings
from app.db import init_db
from app.main import create_app
from app.runtime import build_runtime

TENANT_ID = "11111111-1111-1111-1111-111111111111"
CLIENT_ID = "22222222-2222-2222-2222-222222222222"
CLIENT_SECRET = "test-client-secret"
WEBHOOK_STATE = "expected-state"
WEBHOOK_AUTH = "expected-auth"
FIXED_NOW = datetime(2026, 11, 17, 12, 0, tzinfo=timezone.utc)


def tenant_payload() -> dict:
    return {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "webhook_client_state": WEBHOOK_STATE,
        "webhook_auth_id": WEBHOOK_AUTH,
    }


@pytest.fixture
def tenant_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "M365_TENANT_ID",
        "M365_CLIENT_ID",
        "M365_CLIENT_SECRET",
        "M365_TENANTS_JSON",
        "M365_WEBHOOK_CLIENT_STATE",
        "M365_WEBHOOK_AUTH_ID",
        "M365_USE_AWS_SECRETS",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("M365_TENANTS_JSON", json.dumps({TENANT_ID: tenant_payload()}))
    monkeypatch.setenv("M365_WEBHOOK_CLIENT_STATE", WEBHOOK_STATE)
    monkeypatch.setenv("M365_WEBHOOK_AUTH_ID", WEBHOOK_AUTH)


@pytest.fixture
async def runtime(tmp_path, tenant_env, monkeypatch: pytest.MonkeyPatch):
    from cryptography.fernet import Fernet

    database = (tmp_path / "m365.db").as_posix()
    monkeypatch.setenv("M365_DATABASE_URL", f"sqlite+aiosqlite:///{database}")
    monkeypatch.setenv("TRINETRA_VAULT_KEY", Fernet.generate_key().decode("ascii"))
    monkeypatch.setenv("TRINETRA_EXECUTION_MODE", "mock")
    monkeypatch.delenv("TRINETRA_LIVE_CANARY_TARGETS", raising=False)
    monkeypatch.setenv("M365_START_WORKER", "false")
    monkeypatch.setenv("M365_WEBHOOK_URL", "https://hub.example.com/api/v1/webhooks/m365")
    settings = Settings.from_env()
    active = build_runtime(settings)
    await init_db(active.engine)
    yield active
    await active.engine.dispose()


@pytest.fixture
async def api(runtime):
    import httpx

    application = create_app(runtime)
    transport = httpx.ASGITransport(app=application)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, runtime
