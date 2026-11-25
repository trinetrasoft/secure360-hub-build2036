"""Runtime configuration loaded from the process environment.

Secret values stay in ``pydantic.SecretStr`` so they are redacted in logs and
``repr``. This module never contacts AWS or Microsoft.
"""

from __future__ import annotations

import os

from pydantic import BaseModel, ConfigDict, SecretStr


def _optional(name: str) -> str | None:
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        return None
    return value


def _execution_mode() -> str:
    raw = os.environ.get("TRINETRA_EXECUTION_MODE", "mock").strip().lower()
    if raw not in {"mock", "live"}:
        raise ValueError("TRINETRA_EXECUTION_MODE must be mock or live")
    return raw


def _canary_targets() -> frozenset[str]:
    raw = os.environ.get("TRINETRA_LIVE_CANARY_TARGETS", "")
    return frozenset(item.strip().casefold() for item in raw.split(",") if item.strip())


def _flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


class Settings(BaseModel):
    """Process settings for one ingestion service instance."""

    model_config = ConfigDict(extra="ignore")

    database_url: str = "sqlite+aiosqlite:///./trinetra_m365.db"
    secrets_prefix: str = "trinetra/secure360/m365/"
    aws_region: str | None = None
    use_aws_secrets: bool = False
    webhook_client_state: SecretStr | None = None
    webhook_auth_id: SecretStr | None = None
    webhook_url: str | None = None
    graph_base_url: str = "https://graph.microsoft.com/v1.0"
    manage_base_url: str = "https://manage.office.com/api/v1.0"
    initial_lookback_hours: int = 1
    o365_overlap_seconds: int = 300
    max_http_attempts: int = 5
    start_worker: bool = True
    vault_key: SecretStr | None = None
    execution_mode: str = "mock"
    live_canary_targets: frozenset[str] = frozenset()

    @classmethod
    def from_env(cls) -> Settings:
        return cls(
            database_url=os.environ.get(
                "M365_DATABASE_URL", "sqlite+aiosqlite:///./trinetra_m365.db"
            ),
            secrets_prefix=os.environ.get(
                "M365_SECRETS_PREFIX", "trinetra/secure360/m365/"
            ),
            aws_region=_optional("M365_AWS_REGION") or _optional("AWS_REGION"),
            use_aws_secrets=_flag("M365_USE_AWS_SECRETS", False),
            webhook_client_state=_optional("M365_WEBHOOK_CLIENT_STATE"),
            webhook_auth_id=_optional("M365_WEBHOOK_AUTH_ID"),
            webhook_url=_optional("M365_WEBHOOK_URL"),
            graph_base_url=os.environ.get(
                "M365_GRAPH_BASE_URL", "https://graph.microsoft.com/v1.0"
            ),
            manage_base_url=os.environ.get(
                "M365_MANAGE_BASE_URL", "https://manage.office.com/api/v1.0"
            ),
            initial_lookback_hours=int(os.environ.get("M365_INITIAL_LOOKBACK_HOURS", "1")),
            o365_overlap_seconds=int(os.environ.get("M365_O365_OVERLAP_SECONDS", "300")),
            max_http_attempts=int(os.environ.get("M365_MAX_HTTP_ATTEMPTS", "5")),
            start_worker=_flag("M365_START_WORKER", True),
            vault_key=_optional("TRINETRA_VAULT_KEY"),
            execution_mode=_execution_mode(),
            live_canary_targets=_canary_targets(),
        )
