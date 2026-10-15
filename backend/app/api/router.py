"""Aggregated versioned API router."""

from fastapi import APIRouter

from app.api.managers import router as managers_router
from app.api.service_requests import router as service_requests_router
from app.api.waiters import router as waiters_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(service_requests_router)
api_router.include_router(waiters_router)
api_router.include_router(managers_router)
