"""Aggregated versioned API router."""

from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.api.managers import router as managers_router
from app.api.menu import router as menu_router
from app.api.orders import router as orders_router
from app.api.payments import router as payments_router
from app.api.qr import router as qr_router
from app.api.service_requests import router as service_requests_router
from app.api.waiters import router as waiters_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(menu_router)
api_router.include_router(orders_router)
api_router.include_router(payments_router)
api_router.include_router(qr_router)
api_router.include_router(service_requests_router)
api_router.include_router(waiters_router)
api_router.include_router(managers_router)
