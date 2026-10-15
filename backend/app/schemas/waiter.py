from pydantic import BaseModel, ConfigDict, Field
from typing import Optional
from datetime import datetime
import uuid
from app.models.staff_user import StaffRole

class WaiterToggleStatusRequest(BaseModel):
    is_online: bool

class WaiterTogglePushRequest(BaseModel):
    push_enabled: bool

class WaiterRejectRequest(BaseModel):
    rejection_reason: str = Field(..., min_length=1, max_length=100)

class StaffUserResponse(BaseModel):
    id: uuid.UUID
    restaurant_id: uuid.UUID
    name: str
    email: str
    phone: str
    role: StaffRole
    is_online: bool
    push_enabled: bool
    last_assigned_seq: int
    accepted_count: int
    missed_count: int
    rejected_count: int
    streak: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
