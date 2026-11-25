"""OAuth client-credentials and secret-provider tests."""

from __future__ import annotations

import json

import pytest

from app.connectors.auth import (
    ALLOWED_APPLICATION_PERMISSIONS,
    RESOURCE_SCOPES,
    AwsSecretsManagerProvider,
    ChainedSecretProvider,
    EnvSecretProvider,
    LeastPrivilegeError,
    MsalTokenProvider,
    SecretNotFoundError,
    TenantCredentials,
    TokenResource,
)
from tests.conftest import CLIENT_ID, CLIENT_SECRET, TENANT_ID, tenant_payload

OTHER_TENANT = "33333333-3333-3333-3333-333333333333"


def test_allowlist_is_the_four_least_privilege_permissions():
    assert ALLOWED_APPLICATION_PERMISSIONS == frozenset(
        {
            "SecurityIncident.ReadWrite.All",
            "SecurityAlert.ReadWrite.All",
            "AuditLog.Read.All",
            "ActivityFeed.Read",
        }
    )
    assert set(RESOURCE_SCOPES.values()) == {
        "https://graph.microsoft.com/.default",
        "https://api.security.microsoft.com/.default",
        "https://manage.office.com/.default",
    }


def test_rejects_permissions_outside_the_allowlist():
    with pytest.raises(LeastPrivilegeError):
        TenantCredentials(
            tenant_id=TENANT_ID,
            client_id=CLIENT_ID,
            client_secret=CLIENT_SECRET,
            permissions=["Directory.ReadWrite.All"],
        )


def test_credentials_repr_redacts_the_secret():
    credentials = TenantCredentials(
        tenant_id=TENANT_ID,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
    )
    assert CLIENT_SECRET not in repr(credentials)
    assert CLIENT_SECRET not in str(credentials)


@pytest.mark.asyncio
async def test_env_provider_loads_tenant_json(tenant_env):
    credentials = await EnvSecretProvider().get_credentials(TENANT_ID)
    assert credentials.client_id == CLIENT_ID
    assert credentials.client_secret.get_secret_value() == CLIENT_SECRET
    assert "ActivityFeed.Read" in credentials.permissions


@pytest.mark.asyncio
async def test_env_provider_rejects_overbroad_secret(monkeypatch):
    monkeypatch.delenv("M365_TENANT_ID", raising=False)
    monkeypatch.setenv(
        "M365_TENANTS_JSON",
        json.dumps(
            {
                TENANT_ID: {
                    "client_id": CLIENT_ID,
                    "client_secret": CLIENT_SECRET,
                    "permissions": ["Mail.ReadWrite"],
                }
            }
        ),
    )
    with pytest.raises(LeastPrivilegeError):
        await EnvSecretProvider().get_credentials(TENANT_ID)


@pytest.mark.asyncio
async def test_missing_tenant_raises(monkeypatch):
    monkeypatch.delenv("M365_TENANTS_JSON", raising=False)
    monkeypatch.delenv("M365_TENANT_ID", raising=False)
    monkeypatch.delenv("M365_CLIENT_ID", raising=False)
    monkeypatch.delenv("M365_CLIENT_SECRET", raising=False)
    with pytest.raises(SecretNotFoundError):
        await EnvSecretProvider().get_credentials(TENANT_ID)


class _FakeSecrets:
    def __init__(self, payload: dict):
        self.payload = payload
        self.secret_id = None

    def get_secret_value(self, SecretId: str):
        self.secret_id = SecretId
        return {"SecretString": json.dumps(self.payload)}


@pytest.mark.asyncio
async def test_aws_provider_reads_prefixed_secret_without_logging_it():
    fake = _FakeSecrets(tenant_payload())
    provider = AwsSecretsManagerProvider(client=fake, prefix="trinetra/secure360/m365/")
    credentials = await provider.get_credentials(TENANT_ID)
    assert fake.secret_id == f"trinetra/secure360/m365/{TENANT_ID}"
    assert credentials.client_secret.get_secret_value() == CLIENT_SECRET
    assert credentials.webhook_auth_id is not None
    assert credentials.webhook_auth_id.get_secret_value() == "expected-auth"


@pytest.mark.asyncio
async def test_aws_provider_rejects_overbroad_permissions():
    fake = _FakeSecrets(
        {
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "permissions": ["User.ReadWrite.All"],
        }
    )
    provider = AwsSecretsManagerProvider(client=fake)
    with pytest.raises(LeastPrivilegeError):
        await provider.get_credentials(TENANT_ID)


@pytest.mark.asyncio
async def test_chained_provider_falls_through_to_aws(monkeypatch):
    monkeypatch.delenv("M365_TENANTS_JSON", raising=False)
    monkeypatch.delenv("M365_TENANT_ID", raising=False)
    monkeypatch.delenv("M365_CLIENT_ID", raising=False)
    monkeypatch.delenv("M365_CLIENT_SECRET", raising=False)
    aws = AwsSecretsManagerProvider(client=_FakeSecrets(tenant_payload()))
    provider = ChainedSecretProvider(EnvSecretProvider(), aws)
    credentials = await provider.get_credentials(TENANT_ID)
    assert credentials.tenant_id == TENANT_ID


class _FakeMsalApp:
    def __init__(self):
        self.calls: list[list[str]] = []

    def acquire_token_for_client(self, scopes):
        self.calls.append(list(scopes))
        return {"access_token": "graph-or-o365-token", "expires_in": 3600}


@pytest.mark.asyncio
async def test_msal_requests_only_resource_default_scopes():
    apps: list[_FakeMsalApp] = []

    def factory(credentials):
        assert credentials.client_secret.get_secret_value() == CLIENT_SECRET
        app = _FakeMsalApp()
        apps.append(app)
        return app

    credentials = TenantCredentials(
        tenant_id=TENANT_ID,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
    )
    provider = MsalTokenProvider(app_factory=factory)
    graph = await provider.get_access_token(credentials, TokenResource.GRAPH)
    office = await provider.get_access_token(credentials, TokenResource.O365)
    assert graph == "graph-or-o365-token"
    assert office == "graph-or-o365-token"
    assert len(apps) == 1
    assert apps[0].calls == [
        ["https://graph.microsoft.com/.default"],
        ["https://manage.office.com/.default"],
    ]
    assert CLIENT_SECRET not in graph


@pytest.mark.asyncio
async def test_o365_token_requires_activity_feed_read():
    credentials = TenantCredentials(
        tenant_id=TENANT_ID,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        permissions=["AuditLog.Read.All"],
    )
    provider = MsalTokenProvider(app_factory=lambda credentials: _FakeMsalApp())
    with pytest.raises(LeastPrivilegeError):
        await provider.get_access_token(credentials, TokenResource.O365)


@pytest.mark.asyncio
async def test_graph_token_requires_a_graph_permission():
    credentials = TenantCredentials(
        tenant_id=TENANT_ID,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        permissions=["ActivityFeed.Read"],
    )
    provider = MsalTokenProvider(app_factory=lambda credentials: _FakeMsalApp())
    with pytest.raises(LeastPrivilegeError):
        await provider.get_access_token(credentials, TokenResource.GRAPH)
    token = await provider.get_access_token(credentials, TokenResource.O365)
    assert token == "graph-or-o365-token"
