from datetime import datetime, timezone
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


@router.get("/waiters/{waiter_id}/tasks")
async def get_waiter_tasks(
    waiter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve active incoming and accepted tasks for the waiter."""
    await _get_waiter(db, waiter_id)
    now = datetime.now(timezone.utc)

    from app.models.service_request import ServiceRequestAttempt, AttemptStatus, RequestStatus
    from sqlalchemy.orm import selectinload

    attempts_stmt = (
        select(ServiceRequestAttempt)
        .options(selectinload(ServiceRequestAttempt.request).selectinload(ServiceRequest.table))
        .where(
            ServiceRequestAttempt.waiter_id == waiter_id,
            ServiceRequestAttempt.status == AttemptStatus.WAITING,
            ServiceRequestAttempt.expires_at > now,
        )
        .order_by(ServiceRequestAttempt.assigned_at.desc())
    )
    att_res = await db.execute(attempts_stmt)
    attempts = att_res.scalars().all()

    incoming_tasks = []
    for att in attempts:
        if att.request and att.request.status in (RequestStatus.ASSIGNED, RequestStatus.PENDING, RequestStatus.ESCALATED):
            exp = att.expires_at.replace(tzinfo=timezone.utc) if att.expires_at.tzinfo is None else att.expires_at
            remaining_sec = max(0, int((exp - now).total_seconds()))
            table_num = att.request.table.table_number if (att.request.table and hasattr(att.request.table, "table_number")) else att.request.table_id
            incoming_tasks.append({
                "attempt_id": att.id,
                "request_id": att.request_id,
                "table_id": table_num,
                "service_key": att.request.service_key,
                "details": att.request.details,
                "attempt_number": att.attempt_number,
                "timeout_seconds": att.timeout_seconds,
                "remaining_seconds": remaining_sec,
                "assigned_at": att.assigned_at.isoformat() if att.assigned_at else None,
                "expires_at": att.expires_at.isoformat() if att.expires_at else None,
            })

    accepted_stmt = (
        select(ServiceRequest)
        .options(selectinload(ServiceRequest.table))
        .where(
            ServiceRequest.accepted_by == waiter_id,
            ServiceRequest.status == RequestStatus.ACCEPTED,
        )
        .order_by(ServiceRequest.accepted_at.desc())
    )
    acc_res = await db.execute(accepted_stmt)
    accepted_requests = acc_res.scalars().all()

    in_progress = [
        {
            "request_id": req.id,
            "table_id": req.table.table_number if (req.table and hasattr(req.table, "table_number")) else req.table_id,
            "service_key": req.service_key,
            "details": req.details,
            "accepted_at": req.accepted_at.isoformat() if req.accepted_at else None,
        }
        for req in accepted_requests
    ]

    return {
        "waiter_id": str(waiter_id),
        "incoming": incoming_tasks,
        "in_progress": in_progress,
    }


@router.post(
    "/waiters/{waiter_id}/service-requests/{request_id}/complete",
    response_model=ServiceRequestResponse,
    status_code=status.HTTP_200_OK,
)
async def complete_request(
    waiter_id: uuid.UUID,
    request_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Mark an accepted table service request as completed."""
    await _get_waiter(db, waiter_id)
    from app.models.service_request import RequestStatus
    req = await db.get(ServiceRequest, request_id)
    if req is None:
        raise HTTPException(status_code=404, detail="Service request was not found.")
    if req.accepted_by != waiter_id:
        raise HTTPException(status_code=403, detail="Request is not assigned to this waiter.")
    if req.status != RequestStatus.ACCEPTED:
        raise HTTPException(status_code=400, detail=f"Cannot complete request with status {req.status}.")

    req.status = RequestStatus.CLOSED
    req.closed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(req)
    return req
