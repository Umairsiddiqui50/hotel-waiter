"""Menu and Catalog endpoints for customers and administrators."""

import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.common import get_db
from app.core.security import require_role
from app.models.menu import MenuCategory, MenuItem
from app.models.staff_user import StaffRole
from app.schemas.menu import MenuCategoryResponse, MenuItemCreate, MenuItemResponse, MenuItemUpdate

router = APIRouter(prefix="/menu", tags=["Menu"])

@router.get("/categories", response_model=List[MenuCategoryResponse])
async def list_menu_categories(
    restaurant_id: Optional[uuid.UUID] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve menu categories with nested available items for digital browsing."""
    stmt = (
        select(MenuCategory)
        .options(selectinload(MenuCategory.items))
        .order_by(MenuCategory.sort_order, MenuCategory.name)
    )
    if restaurant_id:
        stmt = stmt.where(MenuCategory.restaurant_id == restaurant_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())

@router.get("/items", response_model=List[MenuItemResponse])
async def list_menu_items(
    category_id: Optional[int] = Query(default=None),
    is_available: Optional[bool] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve list of menu items with availability filters."""
    stmt = select(MenuItem).order_by(MenuItem.name)
    if category_id is not None:
        stmt = stmt.where(MenuItem.category_id == category_id)
    if is_available is not None:
        stmt = stmt.where(MenuItem.is_available == is_available)
    result = await db.execute(stmt)
    return list(result.scalars().all())

@router.post("/items", response_model=MenuItemResponse, status_code=status.HTTP_201_CREATED)
async def create_menu_item(
    payload: MenuItemCreate,
    db: AsyncSession = Depends(get_db),
    admin_user=Depends(require_role(StaffRole.ADMIN, StaffRole.MANAGER)),
):
    """Admin-only: Create a new menu item."""
    cat = await db.get(MenuCategory, payload.category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")
    item = MenuItem(
        category_id=payload.category_id,
        name=payload.name,
        price=payload.price,
        is_available=payload.is_available,
        image_url=payload.image_url,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item

@router.put("/items/{item_id}", response_model=MenuItemResponse)
async def update_menu_item(
    item_id: int,
    payload: MenuItemUpdate,
    db: AsyncSession = Depends(get_db),
    admin_user=Depends(require_role(StaffRole.ADMIN, StaffRole.MANAGER)),
):
    """Admin-only: Update menu item pricing, availability, or category."""
    item = await db.get(MenuItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found.")
    if payload.name is not None:
        item.name = payload.name
    if payload.price is not None:
        item.price = payload.price
    if payload.is_available is not None:
        item.is_available = payload.is_available
    if payload.image_url is not None:
        item.image_url = payload.image_url
    if payload.category_id is not None:
        cat = await db.get(MenuCategory, payload.category_id)
        if not cat:
            raise HTTPException(status_code=404, detail="Category not found.")
        item.category_id = payload.category_id
    await db.commit()
    await db.refresh(item)
    return item

@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_menu_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    admin_user=Depends(require_role(StaffRole.ADMIN, StaffRole.MANAGER)),
):
    """Admin-only: Delete a menu item."""
    item = await db.get(MenuItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found.")
    await db.delete(item)
    await db.commit()
