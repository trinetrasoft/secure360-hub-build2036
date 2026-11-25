"""In-memory Microsoft 365 responder for local ticket tests.

Mutations stay inside this process. A later Graph client can implement the
same ``execute`` and ``graph_get`` methods; the workflow never builds those
URLs itself.
"""

from __future__ import annotations

from typing import Any


class MockM365Responder:
    """Records remediation and answers the follow-up GET from that record."""

    def __init__(self) -> None:
        self.users: dict[str, dict[str, Any]] = {}
        self.devices: dict[str, dict[str, Any]] = {}
        self.incidents: dict[str, dict[str, Any]] = {}
        self.notifications: list[dict[str, str]] = []
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def execute(self, action: str, arguments: dict[str, Any]) -> dict[str, Any]:
        self.calls.append((action, dict(arguments)))
        if action == "revokeSignInSessions":
            row = self._user(str(arguments["userId"]))
            row["sessionsRevoked"] = True
            return {"ok": True, "sessionsRevoked": True}
        if action == "disableUser":
            row = self._user(str(arguments["userId"]))
            row["accountEnabled"] = False
            return {"ok": True, "accountEnabled": False}
        if action == "isolateDevice":
            row = self._device(str(arguments["deviceId"]))
            row["isolationState"] = "Isolated"
            return {"ok": True, "isolationState": "Isolated"}
        if action == "patchIncident":
            row = self._incident(str(arguments["incidentId"]))
            row["status"] = arguments.get("status", "resolved")
            row["classification"] = arguments.get("classification", "truePositive")
            return {
                "ok": True,
                "status": row["status"],
                "classification": row["classification"],
            }
        if action == "enrichAlert":
            row = self._incident(str(arguments["incidentId"]))
            row["enriched"] = True
            return {"ok": True, "enriched": True}
        if action == "notifyUser":
            self.notifications.append(
                {"userId": str(arguments["userId"]), "template": "incident-notice"}
            )
            return {"ok": True, "delivered": True}
        raise ValueError(f"unsupported remediation action {action}")

    async def graph_get(self, resource: str, object_id: str) -> dict[str, Any]:
        """Simulated Graph or Defender GET used to verify a prior mutation."""
        self.calls.append(("GET", {"resource": resource, "id": object_id}))
        if resource == "user":
            row = dict(self._user(object_id))
            row["notified"] = any(item["userId"] == object_id for item in self.notifications)
            return row
        if resource == "device":
            return dict(self._device(object_id))
        if resource == "incident":
            return dict(self._incident(object_id))
        raise ValueError(f"unsupported Graph GET resource {resource}")

    def _user(self, user_id: str) -> dict[str, Any]:
        return self.users.setdefault(
            user_id,
            {"id": user_id, "accountEnabled": True, "sessionsRevoked": False},
        )

    def _device(self, device_id: str) -> dict[str, Any]:
        return self.devices.setdefault(
            device_id,
            {"id": device_id, "isolationState": "NotIsolated"},
        )

    def _incident(self, incident_id: str) -> dict[str, Any]:
        return self.incidents.setdefault(
            incident_id,
            {
                "id": incident_id,
                "status": "active",
                "classification": "unknown",
                "enriched": False,
            },
        )
