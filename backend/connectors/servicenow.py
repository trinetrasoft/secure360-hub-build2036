"""
ServiceNow ITSM Connector — mocked.

Production swap: replace methods with calls to ServiceNow Table API
(/api/now/table/incident, /api/now/table/cmdb_ci_database). Auth via
OAuth 2.0 client credentials.
"""
import asyncio
from datetime import datetime, timedelta
from typing import Any

from .base import BaseConnector


class ServiceNowConnector(BaseConnector):
    def __init__(
        self,
        endpoint: str = "https://example.service-now.com",
        token: str = "mock-token",
    ):
        super().__init__(
            connector_id="servicenow",
            name="ServiceNow",
            category="ITSM",
            endpoint=endpoint,
            auth={"type": "oauth", "token": token},
        )

    async def health_check(self) -> dict[str, Any]:
        await asyncio.sleep(0.05)
        self.status = "connected"
        self.last_sync = datetime.utcnow()
        return {"status": "connected", "instance": "example", "lag_seconds": 4}

    async def fetch_incidents(self) -> list[dict[str, Any]]:
        await asyncio.sleep(0.1)
        return [
            {
                "id": "INC0048231",
                "source": "servicenow",
                "severity": "P1",
                "title": "Production database degradation — checkout service",
                "assigned_to": "DBA Tier-2",
                "opened_at": (datetime.utcnow() - timedelta(minutes=12)).isoformat(),
            }
        ]

    async def fetch_metrics(self) -> list[dict[str, Any]]:
        await asyncio.sleep(0.05)
        return [
            {"metric": "open_incidents", "value": 34},
            {"metric": "mttr_minutes",   "value": 42},
            {"metric": "sla_breaches",   "value": 3},
        ]

    async def create_incident(self, payload: dict[str, Any]) -> dict[str, Any]:
        """POST /api/now/table/incident in production."""
        await asyncio.sleep(0.05)
        return {
            "id": f"INC{int(datetime.utcnow().timestamp())}",
            **payload,
            "created_at": datetime.utcnow().isoformat(),
        }
