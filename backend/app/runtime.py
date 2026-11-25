"""Process-wide handles shared by the API and the pipeline."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.config import Settings
from app.connectors.auth import (
    MsalTokenProvider,
    SecretNotFoundError,
    SecretProvider,
    build_secret_provider,
)
from app.db import create_engine
from app.workflow.executor import MockRemediationExecutor, build_executor


@dataclass
class Runtime:
    settings: Settings
    engine: AsyncEngine
    sessions: async_sessionmaker[AsyncSession]
    secrets: SecretProvider
    tokens: MsalTokenProvider
    queue: asyncio.Queue[str]
    pipeline: Any = None
    scheduler: Any = None
    last_poll_at: str | None = None
    responder: Any = field(default_factory=MockRemediationExecutor)

    async def expected_client_state(self, tenant_id: str) -> str | None:
        credentials = None
        try:
            credentials = await self.secrets.get_credentials(tenant_id)
        except SecretNotFoundError:
            credentials = None
        if credentials is not None and credentials.webhook_client_state is not None:
            return credentials.webhook_client_state.get_secret_value()
        if self.settings.webhook_client_state is not None:
            return self.settings.webhook_client_state.get_secret_value()
        return None

    def accepted_auth_ids(self) -> set[str]:
        found = {item for item in self.secrets.known_webhook_auth_ids() if item}
        if self.settings.webhook_auth_id is not None:
            revealed = self.settings.webhook_auth_id.get_secret_value()
            if revealed:
                found.add(revealed)
        return found


def build_runtime(
    settings: Settings,
    *,
    secrets: SecretProvider | None = None,
    tokens: MsalTokenProvider | None = None,
) -> Runtime:
    engine = create_engine(settings.database_url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    provider = secrets or build_secret_provider(
        use_aws_secrets=settings.use_aws_secrets,
        prefix=settings.secrets_prefix,
        region=settings.aws_region,
    )
    return Runtime(
        settings=settings,
        engine=engine,
        sessions=sessions,
        secrets=provider,
        tokens=tokens or MsalTokenProvider(),
        queue=asyncio.Queue(),
        responder=(
            MockRemediationExecutor()
            if settings.execution_mode == "live"
            else build_executor(settings)
        ),
    )
