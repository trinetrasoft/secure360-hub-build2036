"""Combined HTTP router."""

from fastapi import APIRouter

from app.api.governance import router as governance_router
from app.api.ingestion import router as ingestion_router
from app.api.processing import router as processing_router
from app.api.tickets import router as ticket_router
from app.api.webhooks import router as webhook_router

router = APIRouter()
router.include_router(webhook_router)
router.include_router(ingestion_router)
router.include_router(processing_router)
router.include_router(governance_router)
router.include_router(ticket_router)
