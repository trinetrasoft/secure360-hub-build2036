"""Alembic upgrade creates the processing and governance tables."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


def test_upgrade_creates_processing_and_governance_tables(tmp_path):
    database = tmp_path / "migrated.db"
    url = "sqlite:///" + database.as_posix()
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")
    names = set(inspect(create_engine(url)).get_table_names())
    assert {
        "event_fingerprints",
        "correlated_incidents",
        "incident_signals",
        "pii_vault",
        "audit_log",
        "tickets",
        "ticket_stage_events",
        "knowledge_base_entries",
    } <= names
