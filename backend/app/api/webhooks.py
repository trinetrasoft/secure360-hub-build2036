"""Microsoft Graph and Office 365 webhook endpoint.

The validation handshake returns immediately. It does not read the body, touch
the database, or enqueue work, so it stays inside Microsoft's 10 second limit.
Live notifications are authorized, stored, and put on the in-process queue
before the handler returns 202.
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse, Response

from app.connectors.m365_client import (
    WebhookPayloadError,
    WebhookUnauthorized,
    allowed_hosts_for,
    authorized_notifications,
)
from app.ingestion.store import enqueue_notification
from app.runtime import Runtime

logger = logging.getLogger(__name__)

router = APIRouter()
MAX_WEBHOOK_BYTES = 2_000_000


def validation_token(request: Request) -> str | None:
    for key in request.query_params:
        if key.lower() == "validationtoken":
            return request.query_params[key]
    return None


def _runtime(request: Request) -> Runtime:
    return request.app.state.runtime


@router.post("/api/v1/webhooks/m365")
async def m365_webhook(request: Request) -> Response:
    token = validation_token(request)
    if token is not None:
        return PlainTextResponse(content=token, status_code=200)

    runtime = _runtime(request)
    raw = await request.body()
    if len(raw) > MAX_WEBHOOK_BYTES:
        raise HTTPException(status_code=413, detail="payload too large")
    try:
        body = json.loads(raw) if raw else None
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="invalid json") from None

    try:
        notifications = await authorized_notifications(
            body,
            auth_header=request.headers.get("webhook-authid"),
            accepted_auth_ids=runtime.accepted_auth_ids(),
            client_state_for_tenant=runtime.expected_client_state,
            allowed_hosts=allowed_hosts_for(
                runtime.settings.graph_base_url,
                runtime.settings.manage_base_url,
            ),
        )
    except WebhookUnauthorized:
        logger.info("rejected Microsoft 365 webhook: authorization failed")
        raise HTTPException(status_code=401, detail="unauthorized") from None
    except WebhookPayloadError:
        raise HTTPException(status_code=400, detail="invalid notification") from None

    enqueued = 0
    for kind, tenant_id, notification in notifications:
        envelope_id = await enqueue_notification(
            runtime.sessions,
            kind=kind,
            tenant_id=tenant_id,
            notification=notification,
        )
        runtime.queue.put_nowait(envelope_id)
        enqueued += 1
    return JSONResponse({"enqueued": enqueued}, status_code=202)
