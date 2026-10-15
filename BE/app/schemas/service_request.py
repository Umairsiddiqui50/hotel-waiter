from pydantic import BaseModel, ConfigDict, Field
from typing import Optional
from datetime import datetime
import uuid
from app.models.service_request import RequestStatus, AttemptStatus, ManagerAlertType

class ServiceRequestCreate(BaseModel):
    table_id: int = Field(..., ge=1, le=100)
    service_key: str = Field(..., min_length=1, max_length=50)
    details: Optional[str] = Field("", max_length=255)


class ServiceRequestCancelRequest(BaseModel):
    table_id: Optional[int] = Field(None, ge=1, le=100)

class ServiceRequestResponse(BaseModel):
    id: int
    session_id: uuid.UUID
    table_id: int
    service_key: str
    details: str
    status: RequestStatus
    accepted_by: Optional[uuid.UUID] = None
    resend_count: int
    created_at: datetime
    accepted_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class ServiceRequestAttemptResponse(BaseModel):
    id: int
    request_id: int
    waiter_id: uuid.UUID
    attempt_number: int
    status: AttemptStatus
    rejection_reason: Optional[str] = None
    timeout_seconds: int
    assigned_at: datetime
    expires_at: datetime
    responded_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class ManagerAlertResponse(BaseModel):
    id: int
    request_id: int
    alert_type: ManagerAlertType
    is_open: bool
    resolved_by: Optional[uuid.UUID] = None
    assigned_waiter_id: Optional[uuid.UUID] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
