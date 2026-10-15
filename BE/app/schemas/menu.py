"""Pydantic schemas for Menu Management."""

import uuid
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

class MenuItemBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    price: Decimal = Field(..., gt=0, decimal_places=2)
    is_available: bool = True
    image_url: Optional[str] = None

class MenuItemCreate(MenuItemBase):
    category_id: int

class MenuItemUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[Decimal] = None
    is_available: Optional[bool] = None
    image_url: Optional[str] = None
    category_id: Optional[int] = None

class MenuItemResponse(MenuItemBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    category_id: int

class MenuCategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    restaurant_id: uuid.UUID
    name: str
    sort_order: int
    items: List[MenuItemResponse] = []
