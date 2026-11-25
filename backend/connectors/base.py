"""
BaseConnector — abstract contract every enterprise connector implements.

Subclasses override these methods to call the real API of their respective
source system (Splunk REST, ServiceNow Table API, AWS SDK, etc.). The shape
of return values is normalized so the front-end stays decoupled.
"""
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Optional


class BaseConnector(ABC):
    def __init__(
        self,
        connector_id: str,
        name: str,
        category: str,
        endpoint: Optional[str] = None,
        auth: Optional[dict] = None,
    ):
        self.id = connector_id
        self.name = name
        self.category = category
        self.endpoint = endpoint
        self.auth = auth or {}
        self.status: str = "idle"
        self.last_sync: Optional[datetime] = None

    @abstractmethod
    async def health_check(self) -> dict[str, Any]:
        """Return connector health and basic source-system info."""

    @abstractmethod
    async def fetch_incidents(self) -> list[dict[str, Any]]:
        """Return a normalized list of incidents/events."""

    @abstractmethod
    async def fetch_metrics(self) -> list[dict[str, Any]]:
        """Return a normalized list of metrics."""

    async def fetch_compliance_findings(self) -> list[dict[str, Any]]:
        """Optional — return compliance findings (security tools)."""
        return []
