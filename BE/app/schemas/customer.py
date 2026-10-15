from pydantic import BaseModel, ConfigDict, EmailStr, Field
from typing import Optional
from datetime import datetime
import uuid
from app.models.table import SessionStatus

class CustomerBase(BaseModel):
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    name: Optional[str] = Field(None, max_length=100)

class CustomerCreate(CustomerBase):
    pass

class CustomerResponse(CustomerBase):
    id: uuid.UUID
    is_phone_verified: bool
    is_email_verified: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class CustomerAddressBase(BaseModel):
    recipient_name: str = Field(..., max_length=100)
    recipient_phone: str = Field(..., max_length=20)
    address_line1: str = Field(..., max_length=255)
    address_line2: Optional[str] = Field(None, max_length=255)
    landmark: Optional[str] = Field(None, max_length=150)
    city: str = Field(..., max_length=100)
    postal_code: str = Field(..., max_length=20)
    is_default: bool = False

class CustomerAddressCreate(CustomerAddressBase):
    pass

class CustomerAddressResponse(CustomerAddressBase):
    id: uuid.UUID
    customer_id: uuid.UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class DiningSessionResponse(BaseModel):
    id: uuid.UUID
    table_id: int
    session_token: str
    customer_id: Optional[uuid.UUID] = None
    primary_waiter_id: Optional[uuid.UUID] = None
    status: SessionStatus
    opened_at: datetime
    closed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
