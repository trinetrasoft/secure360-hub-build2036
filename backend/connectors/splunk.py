"""
Splunk SIEM Connector — mocked.

Production swap: replace methods with calls to the Splunk REST API
(/services/search/jobs, /services/saved/searches). Auth via HEC token
or session-key.
"""
import asyncio
from datetime import datetime, timedelta
from random import randint
from typing import Any

from .base import BaseConnector


class SplunkConnector(BaseConnector):
    def __init__(self, endpoint: str = "https://splunk.example.com:8089", token: str = "mock-token"):
        super().__init__(
            connector_id="splunk",
            name="Splunk SIEM",
            category="SIEM",
            endpoint=endpoint,
            auth={"type": "token", "token": token},
        )

    async def health_check(self) -> dict[str, Any]:
        await asyncio.sleep(0.05)
        self.status = "connected"
        self.last_sync = datetime.utcnow()
        return {"status": "connected", "version": "9.1.2", "lag_seconds": 2}

    async def fetch_incidents(self) -> list[dict[str, Any]]:
        await asyncio.sleep(0.1)
        return [
            {
                "id": "SPLK-48231",
                "source": "splunk",
                "severity": "high",
                "title": "Multiple failed admin logins on oracle-prod-04",
                "timestamp": datetime.utcnow().isoformat(),
                "host": "oracle-prod-04",
            },
            {
                "id": "SPLK-48230",
                "source": "splunk",
                "severity": "medium",
                "title": "Unusual data egress from pg-prod-12",
                "timestamp": (datetime.utcnow() - timedelta(minutes=5)).isoformat(),
                "host": "pg-prod-12",
            },
        ]

    async def fetch_metrics(self) -> list[dict[str, Any]]:
        await asyncio.sleep(0.05)
        return [
            {"metric": "events_per_sec",  "value": 14283 + randint(-200, 200)},
            {"metric": "index_lag_sec",   "value": 2},
            {"metric": "active_searches", "value": 47},
        ]
