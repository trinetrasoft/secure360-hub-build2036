"""Async SQLAlchemy engine and schema creation."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.models.security import Base


def create_engine(url: str) -> AsyncEngine:
    connect_args: dict = {}
    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    return create_async_engine(url, connect_args=connect_args)


async def init_db(engine: AsyncEngine) -> None:
    # Importing the audit module registers the append-only listeners.
    # Importing the model package registers the new tables on Base.metadata.
    import app.governance.audit  # noqa: F401
    import app.models  # noqa: F401

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
