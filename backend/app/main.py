"""Trinetra Secure 360 Hub — Microsoft 365 live ingestion service.

Run from the ``backend`` directory:

    uvicorn app.main:app --host 127.0.0.1 --port 8010
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.routes import router
from app.config import Settings
from app.db import init_db
from app.ingestion.pipeline import IngestionPipeline
from app.ingestion.scheduler import IngestionScheduler
from app.runtime import Runtime, build_runtime
from app.workflow.executor import build_executor, require_vault_key

logger = logging.getLogger(__name__)

_VALIDATION_TOKEN = re.compile(r"(validationToken=)[^&\s\"]+", re.IGNORECASE)


class _RedactValidationToken(logging.Filter):
    """Keep the Graph handshake token out of access logs."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = _VALIDATION_TOKEN.sub(r"\1REDACTED", record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(
                _VALIDATION_TOKEN.sub(r"\1REDACTED", item) if isinstance(item, str) else item
                for item in record.args
            )
        return True


def _install_log_redaction() -> None:
    redact = _RedactValidationToken()
    for name in ("uvicorn.access", "uvicorn.error"):
        logging.getLogger(name).addFilter(redact)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    runtime: Runtime = app.state.runtime
    require_vault_key(runtime.settings)
    _install_log_redaction()
    await init_db(runtime.engine)
    timeout = httpx.Timeout(30.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as http:
        if runtime.settings.execution_mode == "live":
            runtime.responder = build_executor(
                runtime.settings,
                http=http,
                tokens=runtime.tokens,
                secrets=runtime.secrets,
            )
        runtime.pipeline = IngestionPipeline(
            session_factory=runtime.sessions,
            secrets=runtime.secrets,
            tokens=runtime.tokens,
            http=http,
            settings=runtime.settings,
        )
        worker = None
        if runtime.settings.start_worker:
            worker = asyncio.create_task(runtime.pipeline.consume(runtime.queue))
        runtime.scheduler = IngestionScheduler(runtime)
        if runtime.settings.execution_mode == "live":
            runtime.scheduler.start()
        try:
            yield
        finally:
            if runtime.scheduler is not None:
                await runtime.scheduler.stop()
            if worker is not None:
                worker.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await worker
    await runtime.engine.dispose()


def create_app(runtime: Runtime | None = None) -> FastAPI:
    active = runtime or build_runtime(Settings.from_env())
    application = FastAPI(
        title="Trinetra Secure 360 Hub M365 Ingestion",
        version=__version__,
        lifespan=lifespan,
    )
    application.state.runtime = active
    application.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ],
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )
    application.include_router(router)
    return application


def __getattr__(name: str):
    if name == "app":
        value = create_app()
        globals()["app"] = value
        return value
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
