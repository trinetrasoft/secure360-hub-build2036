"""Approved Graph and Defender remediation calls.

The workflow uses this only when a process explicitly injects it. Identifiers
are path segments, never a caller-supplied URL.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx


class GraphRemediationError(Exception):
    """Microsoft rejected an approved remediation call."""


def _safe_id(value: str) -> str:
    text = value.strip()
    if not text or any(part in text for part in ("/", "\\", "..", " ", "\n", "\r")):
        raise GraphRemediationError("remediation identifier is not a single path segment")
    return quote(text, safe="@")


class GraphRemediationClient:
    """Execute the four approved response actions and their GET checks."""

    def __init__(
        self,
        http: httpx.AsyncClient,
        token: str,
        *,
        defender_token: str | None = None,
        graph_base: str = "https://graph.microsoft.com/v1.0",
        defender_base: str = "https://api.security.microsoft.com/api",
    ):
        self._http = http
        self._graph_token = token
        self._defender_token = defender_token or token
        self._graph = graph_base.rstrip("/")
        self._defender = defender_base.rstrip("/")

    async def execute(self, action: str, arguments: dict[str, Any]) -> dict[str, Any]:
        if action == "revokeSignInSessions":
            body = await self._send(
                "POST",
                f"{self._graph}/users/{_safe_id(str(arguments['userId']))}/revokeSignInSessions",
            )
            return {"ok": True, "sessionsRevoked": bool(body.get("value", True))}
        if action == "disableUser":
            await self._send(
                "PATCH",
                f"{self._graph}/users/{_safe_id(str(arguments['userId']))}",
                {"accountEnabled": False},
            )
            return {"ok": True, "accountEnabled": False}
        if action == "isolateDevice":
            ticket_id = str(arguments.get("ticketId") or "").strip()
            comment = (
                f"Trinetra Secure 360 Hub Ticket #{ticket_id}"
                if ticket_id
                else "Trinetra approved isolation"
            )
            await self._send(
                "POST",
                f"{self._defender}/machines/{_safe_id(str(arguments['deviceId']))}/isolate",
                {"Comment": comment, "IsolationType": "Full"},
            )
            return {"ok": True, "isolationState": "Isolated"}
        if action == "patchIncident":
            status = str(arguments.get("status", "resolved"))
            classification = str(arguments.get("classification", "truePositive"))
            determination = str(
                arguments.get("determination")
                or ("clean" if classification == "falsePositive" else "malware")
            )
            await self._send(
                "PATCH",
                f"{self._graph}/security/incidents/{_safe_id(str(arguments['incidentId']))}",
                {
                    "status": status,
                    "classification": classification,
                    "determination": determination,
                },
            )
            return {
                "ok": True,
                "status": status,
                "classification": classification,
                "determination": determination,
            }
        raise GraphRemediationError(f"unsupported remediation action {action}")

    async def graph_get(self, resource: str, object_id: str) -> dict[str, Any]:
        safe = _safe_id(object_id)
        if resource == "user":
            return await self._send("GET", f"{self._graph}/users/{safe}")
        if resource == "device":
            return await self._send("GET", f"{self._defender}/machines/{safe}")
        if resource == "incident":
            return await self._send("GET", f"{self._graph}/security/incidents/{safe}")
        raise GraphRemediationError(f"unsupported Graph GET resource {resource}")

    async def _send(
        self,
        method: str,
        url: str,
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        response = await self._http.request(
            method,
            url,
            headers={"Authorization": f"Bearer {self._token_for(url)}"},
            json=body,
        )
        if response.status_code >= 400:
            raise GraphRemediationError(f"Microsoft returned {response.status_code}")
        if not response.content:
            return {}
        payload = response.json()
        if isinstance(payload, dict):
            return payload
        return {}

    def _token_for(self, url: str) -> str:
        if url.startswith(self._defender):
            return self._defender_token
        return self._graph_token
