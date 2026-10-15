"""Orders API with Server-side pricing calculation and verification."""

import uuid
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.common import get_db
from app.core.security import get_current_staff, require_role
from app.models.table import DiningSession, SessionStatus, RestaurantTable
from app.models.menu import MenuItem
from app.models.order import Order, OrderItem, OrderStatus, OrderType
from app.models.staff_user import StaffRole
from app.schemas.order import OrderCreate, OrderResponse, OrderStatusUpdate

router = APIRouter(prefix="/orders", tags=["Orders"])

TAX_RATE = Decimal("0.05")  # 5% GST

@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    payload: OrderCreate,
    db: AsyncSession = Depends(get_db),
):
    """Place a new order with server-enforced pricing (client-side prices ignored)."""
    table = await db.get(RestaurantTable, payload.table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Specified table was not found.")

    # Find or establish active dining session for the table
    session_stmt = (
        select(DiningSession)
        .where(
            DiningSession.table_id == payload.table_id,
            DiningSession.status == SessionStatus.ACTIVE,
        )
        .order_by(DiningSession.opened_at.desc())
        .limit(1)
    )
    res = await db.execute(session_stmt)
    dining_session = res.scalars().first()

    if not dining_session:
        dining_session = DiningSession(
            id=uuid.uuid4(),
            table_id=payload.table_id,
            session_token=f"sess_{uuid.uuid4().hex[:16]}",
            status=SessionStatus.ACTIVE,
        )
        db.add(dining_session)
        await db.flush()

    # Query all requested menu items from the database to guarantee authentic prices and availability
    item_ids = [item.menu_item_id for item in payload.items]
    items_stmt = select(MenuItem).where(MenuItem.id.in_(item_ids))
    items_res = await db.execute(items_stmt)
    db_items = {item.id: item for item in items_res.scalars().all()}

    missing_ids = set(item_ids) - set(db_items.keys())
    if missing_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Menu items {list(missing_ids)} do not exist in the catalog.",
        )

    # Determine next available IDs safely across SQLite and Postgres without schema alteration
    from sqlalchemy import func
    max_order_id = await db.scalar(select(func.coalesce(func.max(Order.id), 0)))
    order_id = (max_order_id or 0) + 1

    max_item_id = await db.scalar(select(func.coalesce(func.max(OrderItem.id), 0)))
    current_item_id = (max_item_id or 0)

    # Verify availability and calculate server subtotal
    subtotal = Decimal("0.00")
    order_items_to_add = []
    for req_item in payload.items:
        current_item_id += 1
        db_item = db_items[req_item.menu_item_id]
        if not db_item.is_available:
            raise HTTPException(
                status_code=400,
                detail=f"Item '{db_item.name}' is currently sold out / unavailable.",
            )
        line_subtotal = (db_item.price * req_item.quantity).quantize(Decimal("0.01"))
        subtotal += line_subtotal
        order_items_to_add.append(
            OrderItem(
                id=current_item_id,
                menu_item_id=db_item.id,
                item_name=db_item.name,
                unit_price=db_item.price,
                quantity=req_item.quantity,
                subtotal=line_subtotal,
            )
        )

    tax_amount = (subtotal * TAX_RATE).quantize(Decimal("0.01"))
    total_amount = subtotal + tax_amount

    order = Order(
        id=order_id,
        restaurant_id=table.restaurant_id,
        order_type=payload.order_type,
        session_id=dining_session.id,
        table_id=table.id,
        status=OrderStatus.CONFIRMED,
        subtotal=subtotal,
        tax_amount=tax_amount,
        delivery_fee=Decimal("0.00"),
        total_amount=total_amount,
        special_instructions=payload.special_instructions,
        items=order_items_to_add,
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    # Reload with items
    stmt_full = select(Order).options(selectinload(Order.items)).where(Order.id == order.id)
    reloaded = (await db.execute(stmt_full)).scalar_one()
    return reloaded

@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve full order details including server calculations and item list."""
    stmt = select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
    order = (await db.execute(stmt)).scalars().first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    return order

@router.get("", response_model=List[OrderResponse])
async def list_orders(
    table_id: Optional[int] = Query(default=None),
    status: Optional[OrderStatus] = Query(default=None),
    limit: int = Query(default=50, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List orders with optional table or status filtering (for staff and kitchen)."""
    stmt = (
        select(Order)
        .options(selectinload(Order.items))
        .order_by(Order.created_at.desc())
        .limit(limit)
    )
    if table_id is not None:
        stmt = stmt.where(Order.table_id == table_id)
    if status is not None:
        stmt = stmt.where(Order.status == status)
    result = await db.execute(stmt)
    return list(result.scalars().all())

@router.patch("/{order_id}/status", response_model=OrderResponse)
async def update_order_status(
    order_id: int,
    payload: OrderStatusUpdate,
    db: AsyncSession = Depends(get_db),
    staff_user=Depends(get_current_staff),
):
    """Staff-only: Advance order through kitchen workflow (PREPARING -> READY -> SERVED)."""
    stmt = select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
    order = (await db.execute(stmt)).scalars().first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    order.status = payload.status
    await db.commit()
    await db.refresh(order)
    return order
