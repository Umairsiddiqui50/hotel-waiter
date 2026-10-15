"""Pydantic schemas for Orders and Checkout."""

import uuid
from decimal import Decimal
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.models.order import OrderStatus, OrderType

class OrderItemRequest(BaseModel):
    menu_item_id: int = Field(..., gt=0)
    quantity: int = Field(..., gt=0, le=50)

class OrderCreate(BaseModel):
    table_id: int = Field(..., gt=0)
    order_type: OrderType = OrderType.DINE_IN
    items: List[OrderItemRequest] = Field(..., min_length=1)
    special_instructions: Optional[str] = Field(None, max_length=500)

class OrderItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    menu_item_id: int
    item_name: str
    unit_price: Decimal
    quantity: int
    subtotal: Decimal

class OrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    restaurant_id: uuid.UUID
    order_type: OrderType
    table_id: Optional[int]
    status: OrderStatus
    subtotal: Decimal
    tax_amount: Decimal
    delivery_fee: Decimal
    total_amount: Decimal
    special_instructions: Optional[str]
    created_at: datetime
    items: List[OrderItemResponse] = []

class OrderStatusUpdate(BaseModel):
    status: OrderStatus
