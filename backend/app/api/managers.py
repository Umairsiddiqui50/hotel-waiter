"""Manager-facing endpoints for alerts, assignment, resolution, and reads."""

import statistics
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common import get_db, domain_error_to_http
from app.models.service_request import (
    ManagerAlert,
    RequestStatus,
    ServiceRequest,
    ServiceRequestAttempt,
)
from app.models.staff_user import StaffRole, StaffUser
from app.models.table import DiningSession, RestaurantTable, SessionStatus, TableSection
from app.schemas.manager import (
    ManagerAssignAlertRequest,
    ManagerDashboardKPIs,
    ManagerResolveAlertRequest,
    TableMapStatusResponse,
)
from app.schemas.service_request import ManagerAlertResponse
from app.schemas.service_request import ServiceRequestResponse
from app.services.routing_engine import manager_assign, manager_resolve

router = APIRouter(tags=["Managers"])


async def _get_manager(db: AsyncSession, manager_id: uuid.UUID) -> StaffUser:
    manager = await db.get(StaffUser, manager_id)
    if manager is None or manager.role != StaffRole.MANAGER:
        raise HTTPException(status_code=404, detail="Manager was not found.")
    return manager


async def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


@router.get(
    "/manager/alerts",
    response_model=List[ManagerAlertResponse],
    status_code=status.HTTP_200_OK,
)
async def list_alerts(
    is_open: Optional[bool] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    statement = select(ManagerAlert).order_by(ManagerAlert.created_at.desc())
    if is_open is not None:
        statement = statement.where(ManagerAlert.is_open == is_open)
    result = await db.execute(statement)
    return list(result.scalars().all())


@router.post(
    "/manager/{manager_id}/alerts/{alert_id}/assign",
    response_model=ServiceRequestResponse,
    status_code=status.HTTP_200_OK,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/json": {
                    "examples": {
                        "manual_assignment": {
                            "summary": "Assign waiter to alert",
                            "value": {"waiter_id": "11111111-2222-3333-4444-555555555555"},
                        }
                    }
                }
            },
        }
    },
)
async def assign_alert(
    manager_id: uuid.UUID,
    alert_id: int,
    payload: ManagerAssignAlertRequest,
    db: AsyncSession = Depends(get_db),
):
    await _get_manager(db, manager_id)
    alert = await db.get(ManagerAlert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Manager alert was not found.")

    try:
        return await manager_assign(
            session=db,
            alert_id=alert_id,
            waiter_id=payload.waiter_id,
        )
    except ValueError as exc:
        raise domain_error_to_http(exc)


@router.post(
    "/manager/{manager_id}/alerts/{alert_id}/resolve",
    response_model=ManagerAlertResponse,
    status_code=status.HTTP_200_OK,
)
async def resolve_alert(
    manager_id: uuid.UUID,
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    payload: Optional[ManagerResolveAlertRequest] = None,
):
    await _get_manager(db, manager_id)
    alert = await db.get(ManagerAlert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Manager alert was not found.")

    try:
        resolved = await manager_resolve(
            session=db,
            alert_id=alert_id,
            resolver_id=manager_id,
        )
    except ValueError as exc:
        raise domain_error_to_http(exc)

    refreshed = await db.get(ManagerAlert, alert_id)
    return refreshed if refreshed is not None else resolved


@router.get(
    "/manager/dashboard",
    response_model=ManagerDashboardKPIs,
    status_code=status.HTTP_200_OK,
)
async def dashboard(db: AsyncSession = Depends(get_db)):
    total_waiters = await db.scalar(
        select(func.count(StaffUser.id)).where(StaffUser.role == StaffRole.WAITER)
    )
    online_waiters = await db.scalar(
        select(func.count(StaffUser.id)).where(
            StaffUser.role == StaffRole.WAITER,
            StaffUser.is_online.is_(True),
        )
    )
    open_requests = await db.scalar(
        select(func.count(ServiceRequest.id)).where(
            ServiceRequest.status.in_(
                [
                    RequestStatus.PENDING,
                    RequestStatus.ASSIGNED,
                    RequestStatus.ESCALATED,
                    RequestStatus.ACCEPTED,
                    RequestStatus.FAILED,
                ]
            )
        )
    )
    active_orders = await db.scalar(
        select(func.count(ServiceRequest.id)).where(
            ServiceRequest.status == RequestStatus.ACCEPTED
        )
    )
    open_alerts = await db.scalar(
        select(func.count(ManagerAlert.id)).where(ManagerAlert.is_open.is_(True))
    )
    missed_today = await db.scalar(
        select(func.coalesce(func.sum(StaffUser.missed_count), 0)).where(
            StaffUser.role == StaffRole.WAITER
        )
    )

    accepted_result = await db.execute(
        select(ServiceRequest).where(
            ServiceRequest.status.in_(
                [RequestStatus.ACCEPTED, RequestStatus.CLOSED]
            ),
            ServiceRequest.accepted_at.is_not(None),
        )
    )
    accepted_requests = accepted_result.scalars().all()
    accept_deltas = [
        (
            _ensure_utc(req.accepted_at) - _ensure_utc(req.created_at)
        ).total_seconds()
        for req in accepted_requests
        if req.created_at is not None
    ]

    closed_result = await db.execute(
        select(ServiceRequest).where(
            ServiceRequest.status == RequestStatus.CLOSED,
            ServiceRequest.accepted_at.is_not(None),
            ServiceRequest.closed_at.is_not(None),
        )
    )
    closed_requests = closed_result.scalars().all()
    service_deltas = [
        (
            _ensure_utc(req.closed_at) - _ensure_utc(req.accepted_at)
        ).total_seconds()
        / 60.0
        for req in closed_requests
    ]

    return ManagerDashboardKPIs(
        waiters_online=online_waiters or 0,
        waiters_total=total_waiters or 0,
        open_requests=open_requests or 0,
        open_alerts=open_alerts or 0,
        active_orders=active_orders or 0,
        missed_today=missed_today or 0,
        avg_accept_time_sec=statistics.fmean(accept_deltas)
        if accept_deltas
        else None,
        avg_service_time_min=statistics.fmean(service_deltas)
        if service_deltas
        else None,
    )


@router.get(
    "/manager/tables",
    response_model=List[TableMapStatusResponse],
    status_code=status.HTTP_200_OK,
)
async def table_map(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RestaurantTable).order_by(RestaurantTable.table_number))
    tables = list(result.scalars().all())

    response: List[TableMapStatusResponse] = []
    active_statuses = [
        RequestStatus.PENDING,
        RequestStatus.ASSIGNED,
        RequestStatus.ESCALATED,
        RequestStatus.ACCEPTED,
        RequestStatus.FAILED,
    ]

    for table in tables:
        requests_result = await db.execute(
            select(ServiceRequest.status).where(
                ServiceRequest.table_id == table.id,
                ServiceRequest.status.in_(active_statuses),
            )
        )
        statuses = [row[0] for row in requests_result.all()]
        open_count = len(statuses)

        if any(status == RequestStatus.FAILED for status in statuses):
            badge = "alert"
        elif any(status == RequestStatus.ACCEPTED for status in statuses):
            badge = "acc"
        elif statuses:
            badge = "wait"
        else:
            badge = "normal"

        latest_session_result = await db.execute(
            select(DiningSession)
            .where(
                DiningSession.table_id == table.id,
                DiningSession.status == SessionStatus.ACTIVE,
            )
            .order_by(DiningSession.opened_at.desc())
            .limit(1)
        )
        dining_session = latest_session_result.scalars().first()
        primary_waiter_name: Optional[str] = None
        if dining_session is not None and dining_session.primary_waiter_id is not None:
            primary_waiter = await db.get(StaffUser, dining_session.primary_waiter_id)
            if primary_waiter is not None:
                primary_waiter_name = primary_waiter.name

        response.append(
            TableMapStatusResponse(
                table_number=table.table_number,
                section=table.section,
                is_active=table.is_active,
                status_badge=badge,
                primary_waiter_name=primary_waiter_name,
                open_requests_count=open_count,
            )
        )

    return response
