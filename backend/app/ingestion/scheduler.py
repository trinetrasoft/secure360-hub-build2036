"""Background poller for live Microsoft 365 ingestion.

The loop runs only when ``TRINETRA_EXECUTION_MODE=live``. Each pass asks the
existing pipeline to continue from the stored ``Checkpoint`` cursor, then opens
a ticket at ``1. INTAKE`` for every Graph incident that does not already have one.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from typing import Any

from sqlalchemy import select

from app.governance.guardrails import PiiMasker
from app.models.security import CanonicalSecurityEvent
from app.models.workflow import Ticket
from app.timeutil import format_graph, utcnow
from app.workflow.service import TicketWorkflow
from app.workflow.state_machine import INTAKE

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 60

_PRIORITY = {
    "critical": ("P1", 90),
    "high": ("P2", 60),
    "medium": ("P2", 45),
    "low": ("P3", 20),
    "informational": ("P3", 10),
}


class IngestionScheduler:
    """Poll Graph incidents and Office 365 content blobs on a fixed interval."""

    def __init__(self, runtime: Any, *, interval_seconds: int = POLL_INTERVAL_SECONDS):
        self._runtime = runtime
        self._interval = interval_seconds
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        task = self._task
        self._task = None
        if task is None:
            return
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

    async def sync_tenant(self, tenant_id: str) -> dict[str, Any]:
        pipeline = self._runtime.pipeline
        if pipeline is None:
            raise RuntimeError("ingestion pipeline is not ready")
        summary = await pipeline.poll_tenant(tenant_id)
        opened = await self.open_new_incidents(tenant_id)
        self._runtime.last_poll_at = format_graph(utcnow())
        return {
            "last_poll_at": self._runtime.last_poll_at,
            "tickets_opened": opened,
            "tenants": [summary.model_dump()],
        }

    async def poll_all(self) -> dict[str, Any]:
        opened = 0
        tenants: list[dict[str, Any]] = []
        for tenant_id in list(self._runtime.secrets.known_tenant_ids()):
            try:
                result = await self.sync_tenant(tenant_id)
            except Exception:
                logger.exception("live ingestion poll failed for tenant %s", tenant_id)
                tenants.append({"tenant_id": tenant_id, "error": "poll failed"})
                continue
            opened += int(result["tickets_opened"])
            tenants.extend(result["tenants"])
        if self._runtime.last_poll_at is None:
            self._runtime.last_poll_at = format_graph(utcnow())
        return {
            "last_poll_at": self._runtime.last_poll_at,
            "tickets_opened": opened,
            "tenants": tenants,
        }

    async def open_new_incidents(self, tenant_id: str) -> int:
        """Open one ``1. INTAKE`` ticket per new Graph incident id."""
        key = self._runtime.settings.vault_key
        if key is None:
            return 0
        masker = PiiMasker(key.get_secret_value())
        workflow = TicketWorkflow(self._runtime.responder)
        opened = 0
        async with self._runtime.sessions() as session:
            async with session.begin():
                events = list(
                    await session.scalars(
                        select(CanonicalSecurityEvent).where(
                            CanonicalSecurityEvent.tenant_id == tenant_id,
                            CanonicalSecurityEvent.event_type == "security.incident",
                        )
                    )
                )
                for event in events:
                    if not event.external_id:
                        continue
                    existing = await session.scalar(
                        select(Ticket.id).where(
                            Ticket.tenant_id == tenant_id,
                            Ticket.graph_incident_id == event.external_id,
                        )
                    )
                    if existing:
                        continue
                    priority, score = _PRIORITY.get(event.severity, ("P3", 15))
                    resource = event.resource or ""
                    title = (
                        resource
                        if resource and "@" not in resource
                        else f"Graph incident {event.external_id}"
                    )
                    actor = event.actor or ""
                    await workflow.open_ticket(
                        session,
                        tenant_id=tenant_id,
                        actor="ingestion-scheduler",
                        role="ADMIN",
                        source="m365_detection",
                        title=title[:200],
                        description=(
                            f"Graph security incident {event.external_id} "
                            f"at severity {event.severity}."
                        ),
                        priority=priority,
                        risk_score=score,
                        correlated_incident_id=None,
                        user_principal_name=actor if "@" in actor else None,
                        source_ip=None,
                        device_id=event.device,
                        graph_incident_id=event.external_id,
                        masker=masker,
                    )
                    opened += 1
        if opened:
            logger.info("opened %s tickets at %s for tenant %s", opened, INTAKE, tenant_id)
        return opened

    async def _loop(self) -> None:
        while True:
            try:
                await self.poll_all()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("live ingestion poll failed")
            await asyncio.sleep(self._interval)
