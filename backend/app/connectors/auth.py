"""Multi-tenant OAuth 2.0 client-credentials flow and secret retrieval.

Application permissions are an allowlist. Client-credentials tokens are requested
only as ``{resource}/.default`` for Microsoft Graph, Defender for Endpoint, and
the Office 365 Management API. Broader resources such as Azure Resource Manager
are not requested.

Secrets are read from the process environment or, when configured, from AWS
Secrets Manager at call time. Values are held in ``SecretStr`` and are never
written to logs by this module.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import re
from collections.abc import Callable, Mapping
from enum import Enum
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator

TENANT_ID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)

GRAPH_APPLICATION_PERMISSIONS = frozenset(
    {
        "SecurityIncident.ReadWrite.All",
        "SecurityAlert.ReadWrite.All",
        "AuditLog.Read.All",
    }
)
O365_APPLICATION_PERMISSIONS = frozenset({"ActivityFeed.Read"})
ALLOWED_APPLICATION_PERMISSIONS = GRAPH_APPLICATION_PERMISSIONS | O365_APPLICATION_PERMISSIONS
DEFAULT_APPLICATION_PERMISSIONS = (
    "SecurityIncident.ReadWrite.All",
    "SecurityAlert.ReadWrite.All",
    "AuditLog.Read.All",
    "ActivityFeed.Read",
)

GRAPH_CLIENT_CREDENTIAL_SCOPE = "https://graph.microsoft.com/.default"
DEFENDER_CLIENT_CREDENTIAL_SCOPE = "https://api.security.microsoft.com/.default"
O365_CLIENT_CREDENTIAL_SCOPE = "https://manage.office.com/.default"
AUTHORITY_HOST = "https://login.microsoftonline.com"


class TokenResource(str, Enum):
    GRAPH = "graph"
    DEFENDER = "defender"
    O365 = "o365"


RESOURCE_SCOPES = {
    TokenResource.GRAPH: GRAPH_CLIENT_CREDENTIAL_SCOPE,
    TokenResource.DEFENDER: DEFENDER_CLIENT_CREDENTIAL_SCOPE,
    TokenResource.O365: O365_CLIENT_CREDENTIAL_SCOPE,
}


class LeastPrivilegeError(Exception):
    """Raised when a credential asks for a permission outside the allowlist."""


class SecretNotFoundError(Exception):
    """Raised when no secret is configured for a tenant."""

    def __init__(self, tenant_id: str):
        self.tenant_id = tenant_id
        super().__init__(f"No Microsoft 365 credentials are configured for tenant {tenant_id}")


class SecretFormatError(Exception):
    """Raised when a secret payload is missing required fields."""


class SecretRetrievalError(Exception):
    """Raised when Secrets Manager cannot be read. The secret value is not included."""


class M365AuthError(Exception):
    """Raised when Entra ID refuses a client-credentials token request."""

    def __init__(self, error: str, description: str = ""):
        self.error = error
        self.description = description
        message = error if not description else f"{error}: {description}"
        super().__init__(message)


def enforce_least_privilege(permissions: list[str] | tuple[str, ...] | set[str]) -> tuple[str, ...]:
    """Reject any application permission that is not on the allowlist."""
    requested = tuple(permissions)
    extra = set(requested) - ALLOWED_APPLICATION_PERMISSIONS
    if extra:
        names = ", ".join(sorted(extra))
        raise LeastPrivilegeError(
            "Refusing application permissions outside the least-privilege allowlist: "
            f"{names}"
        )
    if not requested:
        raise LeastPrivilegeError("At least one allowlisted application permission is required")
    return requested


def secrets_equal(provided: str, expected: str) -> bool:
    """Constant-time comparison. Empty values never match."""
    if not provided or not expected:
        return False
    try:
        return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))
    except (TypeError, ValueError):
        return False


def validate_tenant_id(tenant_id: str) -> str:
    if not TENANT_ID_RE.match(tenant_id or ""):
        raise ValueError("tenant_id must be an Entra directory GUID")
    return tenant_id


class TenantCredentials(BaseModel):
    """Per-tenant app registration. The client secret is write-only."""

    model_config = ConfigDict(extra="ignore")

    tenant_id: str
    client_id: str
    client_secret: SecretStr
    webhook_client_state: SecretStr | None = None
    webhook_auth_id: SecretStr | None = None
    permissions: list[str] = Field(
        default_factory=lambda: list(DEFAULT_APPLICATION_PERMISSIONS)
    )

    @field_validator("tenant_id", "client_id")
    @classmethod
    def _guid(cls, value: str) -> str:
        return validate_tenant_id(value)

    @field_validator("permissions")
    @classmethod
    def _permissions(cls, value: list[str]) -> list[str]:
        return list(enforce_least_privilege(value))


def credentials_from_mapping(tenant_id: str, payload: Mapping[str, Any]) -> TenantCredentials:
    client_id = payload.get("client_id")
    client_secret = payload.get("client_secret")
    if not isinstance(client_id, str) or not isinstance(client_secret, str) or not client_secret:
        raise SecretFormatError(
            f"Secret for tenant {tenant_id} is missing client_id or client_secret"
        )
    permissions = payload.get("permissions", list(DEFAULT_APPLICATION_PERMISSIONS))
    if not isinstance(permissions, list) or not all(isinstance(item, str) for item in permissions):
        raise SecretFormatError(f"Secret for tenant {tenant_id} has an invalid permissions list")
    state = payload.get("webhook_client_state")
    auth_id = payload.get("webhook_auth_id")
    return TenantCredentials(
        tenant_id=tenant_id,
        client_id=client_id,
        client_secret=client_secret,
        webhook_client_state=state if isinstance(state, str) and state else None,
        webhook_auth_id=auth_id if isinstance(auth_id, str) and auth_id else None,
        permissions=permissions,
    )


class SecretProvider(Protocol):
    async def get_credentials(self, tenant_id: str) -> TenantCredentials: ...

    def known_webhook_auth_ids(self) -> list[str]: ...


class EnvSecretProvider:
    """Load tenant credentials from ``M365_TENANTS_JSON`` or single-tenant env vars.

    ``M365_TENANTS_JSON`` is a map of tenant GUID to
    ``{client_id, client_secret, webhook_client_state, webhook_auth_id, permissions}``.
    A single tenant can also be set with ``M365_TENANT_ID``, ``M365_CLIENT_ID``,
    and ``M365_CLIENT_SECRET``.
    """

    async def get_credentials(self, tenant_id: str) -> TenantCredentials:
        validate_tenant_id(tenant_id)
        payload = self._load_map().get(tenant_id)
        if payload is None:
            single = self._single_tenant()
            if single is not None and single[0] == tenant_id:
                payload = single[1]
        if payload is None:
            raise SecretNotFoundError(tenant_id)
        return credentials_from_mapping(tenant_id, payload)

    def known_webhook_auth_ids(self) -> list[str]:
        found: list[str] = []
        for payload in self._load_map().values():
            auth_id = payload.get("webhook_auth_id")
            if isinstance(auth_id, str) and auth_id:
                found.append(auth_id)
        single = self._single_tenant()
        if single is not None:
            auth_id = single[1].get("webhook_auth_id")
            if isinstance(auth_id, str) and auth_id:
                found.append(auth_id)
        standalone = os.environ.get("M365_WEBHOOK_AUTH_ID")
        if standalone:
            found.append(standalone)
        return found

    def known_tenant_ids(self) -> list[str]:
        found = [tenant_id for tenant_id in self._load_map() if isinstance(tenant_id, str)]
        single = self._single_tenant()
        if single is not None and single[0] not in found:
            found.append(single[0])
        return found

    def _load_map(self) -> dict[str, dict[str, Any]]:
        raw = os.environ.get("M365_TENANTS_JSON")
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            raise SecretFormatError("M365_TENANTS_JSON is not valid JSON") from None
        if not isinstance(parsed, dict):
            raise SecretFormatError("M365_TENANTS_JSON must be a JSON object")
        cleaned: dict[str, dict[str, Any]] = {}
        for key, value in parsed.items():
            if not isinstance(key, str) or not isinstance(value, dict):
                raise SecretFormatError("M365_TENANTS_JSON entries must be objects keyed by tenant id")
            cleaned[key] = value
        return cleaned

    def _single_tenant(self) -> tuple[str, dict[str, Any]] | None:
        tenant_id = os.environ.get("M365_TENANT_ID")
        client_id = os.environ.get("M365_CLIENT_ID")
        client_secret = os.environ.get("M365_CLIENT_SECRET")
        if not tenant_id or not client_id or not client_secret:
            return None
        payload: dict[str, Any] = {
            "client_id": client_id,
            "client_secret": client_secret,
        }
        state = os.environ.get("M365_WEBHOOK_CLIENT_STATE")
        auth_id = os.environ.get("M365_WEBHOOK_AUTH_ID")
        if state:
            payload["webhook_client_state"] = state
        if auth_id:
            payload["webhook_auth_id"] = auth_id
        return tenant_id, payload


class AwsSecretsManagerProvider:
    """Fetch one tenant secret from AWS Secrets Manager.

    Secret id is ``{prefix}{tenant_id}``. The secret string is JSON with the
    same shape as ``M365_TENANTS_JSON`` values. Pass ``client`` in tests. The
    boto3 client is created only on the first real fetch.
    """

    def __init__(
        self,
        *,
        client: Any | None = None,
        prefix: str = "trinetra/secure360/m365/",
        region: str | None = None,
    ):
        self._client = client
        self._prefix = prefix
        self._region = region

    async def get_credentials(self, tenant_id: str) -> TenantCredentials:
        validate_tenant_id(tenant_id)
        secret_id = f"{self._prefix}{tenant_id}"
        try:
            response = await asyncio.to_thread(
                self._boto().get_secret_value, SecretId=secret_id
            )
        except Exception as exc:
            if type(exc).__name__ == "ResourceNotFoundException":
                raise SecretNotFoundError(tenant_id) from None
            raise SecretRetrievalError(
                f"Secrets Manager request failed for tenant {tenant_id} ({type(exc).__name__})"
            ) from None
        raw = response.get("SecretString") if isinstance(response, dict) else None
        if not isinstance(raw, str) or not raw:
            raise SecretFormatError(f"Secret for tenant {tenant_id} has no SecretString")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            raise SecretFormatError(f"Secret for tenant {tenant_id} is not valid JSON") from None
        if not isinstance(payload, dict):
            raise SecretFormatError(f"Secret for tenant {tenant_id} must be a JSON object")
        return credentials_from_mapping(tenant_id, payload)

    def known_webhook_auth_ids(self) -> list[str]:
        return []

    def known_tenant_ids(self) -> list[str]:
        return []

    def _boto(self) -> Any:
        if self._client is None:
            import boto3

            self._client = boto3.client("secretsmanager", region_name=self._region)
        return self._client


class ChainedSecretProvider:
    """Try the primary provider, then the secondary, for each tenant."""

    def __init__(self, primary: SecretProvider, secondary: SecretProvider):
        self._primary = primary
        self._secondary = secondary

    async def get_credentials(self, tenant_id: str) -> TenantCredentials:
        try:
            return await self._primary.get_credentials(tenant_id)
        except SecretNotFoundError:
            return await self._secondary.get_credentials(tenant_id)

    def known_webhook_auth_ids(self) -> list[str]:
        found: list[str] = []
        for provider in (self._primary, self._secondary):
            found.extend(provider.known_webhook_auth_ids())
        return found

    def known_tenant_ids(self) -> list[str]:
        found: list[str] = []
        for provider in (self._primary, self._secondary):
            method = getattr(provider, "known_tenant_ids", None)
            if method is None:
                continue
            for tenant_id in method():
                if tenant_id not in found:
                    found.append(tenant_id)
        return found


def build_secret_provider(*, use_aws_secrets: bool, prefix: str, region: str | None) -> SecretProvider:
    environment = EnvSecretProvider()
    if not use_aws_secrets:
        return environment
    aws = AwsSecretsManagerProvider(prefix=prefix, region=region)
    return ChainedSecretProvider(environment, aws)


MsalAppFactory = Callable[[TenantCredentials], Any]


def _default_msal_app(credentials: TenantCredentials) -> Any:
    import msal

    return msal.ConfidentialClientApplication(
        client_id=credentials.client_id,
        client_credential=credentials.client_secret.get_secret_value(),
        authority=f"{AUTHORITY_HOST}/{credentials.tenant_id}",
    )


class MsalTokenProvider:
    """Acquire and cache client-credentials tokens per tenant and resource.

    MSAL is synchronous. Token calls run in a worker thread. The in-process
    cache key includes a hash of the secret so a rotation builds a new client
    without putting the secret in logs.
    """

    def __init__(self, app_factory: MsalAppFactory | None = None):
        self._factory = app_factory or _default_msal_app
        self._apps: dict[tuple[str, str, str], Any] = {}

    async def get_access_token(
        self,
        credentials: TenantCredentials,
        resource: TokenResource,
    ) -> str:
        self._assert_resource_permissions(credentials, resource)
        scope = RESOURCE_SCOPES[resource]
        application = self._application(credentials)
        result = await asyncio.to_thread(
            application.acquire_token_for_client, scopes=[scope]
        )
        if not isinstance(result, dict) or "access_token" not in result:
            error = "token_error"
            description = ""
            if isinstance(result, dict):
                error = str(result.get("error") or error)
                description = str(result.get("error_description") or "")
            raise M365AuthError(error, description)
        token = result["access_token"]
        if not isinstance(token, str) or not token:
            raise M365AuthError("empty_token", "Entra ID returned an empty access token")
        return token

    def _application(self, credentials: TenantCredentials) -> Any:
        fingerprint = hashlib.sha256(
            credentials.client_secret.get_secret_value().encode("utf-8")
        ).hexdigest()
        key = (credentials.tenant_id, credentials.client_id, fingerprint)
        application = self._apps.get(key)
        if application is None:
            application = self._factory(credentials)
            self._apps[key] = application
        return application

    @staticmethod
    def _assert_resource_permissions(
        credentials: TenantCredentials,
        resource: TokenResource,
    ) -> None:
        declared = set(enforce_least_privilege(credentials.permissions))
        if resource is TokenResource.GRAPH or resource is TokenResource.DEFENDER:
            if not declared & GRAPH_APPLICATION_PERMISSIONS:
                raise LeastPrivilegeError(
                    "Graph and Defender client credentials require SecurityIncident.ReadWrite.All, "
                    "SecurityAlert.ReadWrite.All, or AuditLog.Read.All"
                )
            return
        if "ActivityFeed.Read" not in declared:
            raise LeastPrivilegeError(
                "Office 365 Management API client credentials require ActivityFeed.Read"
            )
