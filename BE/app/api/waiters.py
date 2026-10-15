"""Waiter-facing endpoints for accepting, rejecting, and toggling state."""

import uuid

from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common import get_db, domain_error_to_http
from app.models.service_request import ServiceRequest
from app.models.staff_user import StaffRole, StaffUser
from app.schemas.service_request import ServiceRequestResponse
from app.schemas.waiter import (
    StaffUserResponse,
    WaiterRejectRequest,
    WaiterTogglePushRequest,
    WaiterToggleStatusRequest,
)
from app.services.routing_engine import (
    accept_waiter,
    offline_safeguard,
    reject_waiter,
)


router = APIRouter(tags=["Waiters"])


async def _get_waiter(db: AsyncSession, waiter_id) -> StaffUser:
    waiter = await db.get(StaffUser, waiter_id)
    if waiter is None or waiter.role != StaffRole.WAITER:
        raise HTTPException(status_code=404, detail="Waiter was not found.")
    return waiter


@router.get(
    "/waiters",
    response_model=List[StaffUserResponse],
    status_code=status.HTTP_200_OK,
)
async def list_waiters(
    restaurant_id: Optional[uuid.UUID] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    statement = select(StaffUser).where(StaffUser.role == StaffRole.WAITER)
    if restaurant_id is not None:
        statement = statement.where(StaffUser.restaurant_id == restaurant_id)
    statement = statement.order_by(StaffUser.name)
    result = await db.execute(statement)
    return list(result.scalars().all())


@router.post(
    "/waiters/{waiter_id}/service-requests/{request_id}/accept",
    response_model=ServiceRequestResponse,
    status_code=status.HTTP_200_OK,
)
async def accept_request(
    waiter_id: uuid.UUID,
    request_id: int,
    db: AsyncSession = Depends(get_db),
):
    await _get_waiter(db, waiter_id)
    try:
        request = await accept_waiter(session=db, request_id=request_id, waiter_id=waiter_id)
        return request
    except ValueError as exc:
        raise domain_error_to_http(exc)


@router.post(
    "/waiters/{waiter_id}/service-requests/{request_id}/reject",
    response_model=ServiceRequestResponse,
    status_code=status.HTTP_200_OK,
)
async def reject_request(
    waiter_id: uuid.UUID,
    request_id: int,
    payload: WaiterRejectRequest,
    db: AsyncSession = Depends(get_db),
):
    await _get_waiter(db, waiter_id)
    try:
        return await reject_waiter(
            session=db,
            request_id=request_id,
            waiter_id=waiter_id,
            reason=payload.rejection_reason,
        )
    except ValueError as exc:
        raise domain_error_to_http(exc)


@router.patch(
    "/waiters/{waiter_id}/status",
    response_model=StaffUserResponse,
    status_code=status.HTTP_200_OK,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/json": {
                    "examples": {
                        "go_offline": {
                            "summary": "Go offline",
                            "value": {"is_online": False},
                        },
                        "return_online": {
                            "summary": "Return online",
                            "value": {"is_online": True},
                        },
                    }
                }
            },
        }
    },
)
async def toggle_status(
    waiter_id: uuid.UUID,
    payload: WaiterToggleStatusRequest,
    db: AsyncSession = Depends(get_db),
):
    waiter = await _get_waiter(db, waiter_id)
    try:
        await offline_safeguard(db, waiter_id=waiter_id, is_online=payload.is_online)
    except ValueError as exc:
        raise domain_error_to_http(exc)
    await db.refresh(waiter)
    return waiter


@router.patch(
    "/waiters/{waiter_id}/push-enabled",
    response_model=StaffUserResponse,
    status_code=status.HTTP_200_OK,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/json": {
                    "examples": {
                        "disable_push": {
                            "summary": "Disable push",
                            "value": {"push_enabled": False},
                        }
                    }
                }
            },
        }
    },
)
async def toggle_push(
    waiter_id: uuid.UUID,
    payload: WaiterTogglePushRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    waiter = await _get_waiter(db, waiter_id)
    waiter.push_enabled = payload.push_enabled
    await db.commit()
    await db.refresh(waiter)
    return waiter


@router.get(
    "/waiters/{waiter_id}",
    response_model=StaffUserResponse,
    status_code=status.HTTP_200_OK,
)
async def get_waiter(
    waiter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    return await _get_waiter(db, waiter_id)
