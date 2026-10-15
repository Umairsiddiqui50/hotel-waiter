"""Customer and table-facing service request endpoints."""

from typing import List

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common import get_db, domain_error_to_http

from app.models.service_request import ServiceRequest, ServiceRequestAttempt
from app.schemas.service_request import (
    ServiceRequestCancelRequest,
    ServiceRequestCreate,
    ServiceRequestResponse,
    ServiceRequestAttemptResponse,
)
from app.services.routing_engine import (
    cancel_service_request,
    create_service_request,
    resend_service_request,
)

router = APIRouter(tags=["Service Requests"])


@router.post(
    "/service-requests",
    response_model=ServiceRequestResponse,
    status_code=status.HTTP_201_CREATED,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/json": {
                    "examples": {
                        "water_request": {
                            "summary": "Request water",
                            "value": {"table_id": 7, "service_key": "water", "details": "Cold"},
                        }
                    }
                }
            },
        }
    },
)
async def create_request(
    payload: ServiceRequestCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a service request and trigger the first routed assignment."""
    try:
        request = await create_service_request(
            session=db,
            table_id=payload.table_id,
            service_key=payload.service_key,
            details=payload.details or "",
        )
        return request
    except ValueError as exc:
        raise domain_error_to_http(exc)


@router.post(
    "/service-requests/{request_id}/resend",
    response_model=ServiceRequestResponse,
    status_code=status.HTTP_200_OK,
)
async def resend_request(
    request_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Resend a customer request while preserving cooldown and resend limits."""
    try:
        request = await resend_service_request(session=db, request_id=request_id)
        return request
    except ValueError as exc:
        raise domain_error_to_http(exc)


@router.post(
    "/service-requests/{request_id}/cancel",
    response_model=ServiceRequestResponse,
    status_code=status.HTTP_200_OK,
    openapi_extra={
        "requestBody": {
            "required": False,
            "content": {
                "application/json": {
                    "examples": {
                        "table_guard": {
                            "summary": "Cancel while identifying table",
                            "value": {"table_id": 7},
                        }
                    }
                }
            },
        }
    },
)
async def cancel_request(
    request_id: int,
    payload: Optional[ServiceRequestCancelRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    table_id = payload.table_id if payload is not None else None
    try:
        return await cancel_service_request(
            session=db,
            request_id=request_id,
            table_id=table_id,
        )
    except ValueError as exc:
        raise domain_error_to_http(exc)

@router.get(
    "/service-requests/{request_id}",
    response_model=ServiceRequestResponse,
    status_code=status.HTTP_200_OK,
)
async def get_request(
    request_id: int,
    db: AsyncSession = Depends(get_db),
):
    request = await db.get(ServiceRequest, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Service request was not found.")
    return request


@router.get(
    "/service-requests/{request_id}/attempts",
    response_model=List[ServiceRequestAttemptResponse],
    status_code=status.HTTP_200_OK,
)
async def list_request_attempts(
    request_id: int,
    db: AsyncSession = Depends(get_db),
):
    request = await db.get(ServiceRequest, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Service request was not found.")

    result = await db.execute(
        select(ServiceRequestAttempt)
        .where(ServiceRequestAttempt.request_id == request_id)
        .order_by(ServiceRequestAttempt.assigned_at)
    )
    return list(result.scalars().all())
