"""Customer & Table Discovery API endpoints."""
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from DB.session import get_db
from DB.models.table import RestaurantTable, DiningSession, SessionStatus

router = APIRouter(prefix="/customers", tags=["Customers"])

@router.get("/table/{table_number}")
async def get_table_info(
    table_number: int,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve table status and section context for customer QR entry."""
    stmt = select(RestaurantTable).where(RestaurantTable.table_number == table_number)
    res = await db.execute(stmt)
    table = res.scalars().first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found.")
    return {
        "table_id": table.id,
        "table_number": table.table_number,
        "section": table.section.value,
        "is_active": table.is_active,
    }
