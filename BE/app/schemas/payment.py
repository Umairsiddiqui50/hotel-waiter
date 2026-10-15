"""Pydantic schemas for Payments and Webhooks."""

import uuid
from decimal import Decimal
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from app.models.payment import PaymentMethod, PaymentStatus

class PaymentCreateRequest(BaseModel):
    order_id: int
    payment_method: PaymentMethod = PaymentMethod.UPI

class PaymentOrderResponse(BaseModel):
    payment_id: uuid.UUID
    order_id: int
    amount: Decimal
    currency: str
    gateway_order_id: str
    gateway_key_id: str
    gateway_name: str
    is_test_mode: bool

class PaymentVerifyRequest(BaseModel):
    payment_id: uuid.UUID
    gateway_order_id: str
    gateway_payment_id: str
    signature: str

class PaymentReceiptResponse(BaseModel):
    payment_id: uuid.UUID
    order_id: int
    amount: Decimal
    payment_method: PaymentMethod
    payment_status: PaymentStatus
    gateway_transaction_id: str
    paid_at: datetime
    is_verified: bool
