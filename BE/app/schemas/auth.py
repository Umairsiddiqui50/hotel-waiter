"""Pydantic schemas for Staff Authentication."""

import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from app.models.staff_user import StaffRole

class LoginRequest(BaseModel):
    identifier: str = Field(..., description="Staff email, username, or phone")
    password: str = Field(..., min_length=1, description="Staff password")

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: StaffRole
    user_id: uuid.UUID
    name: str
    email: str
    is_online: bool
    push_enabled: bool
    restaurant_id: uuid.UUID

class StaffProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    restaurant_id: uuid.UUID
    name: str
    email: str
    phone: str
    role: StaffRole
    is_online: bool
    push_enabled: bool
    created_at: datetime
