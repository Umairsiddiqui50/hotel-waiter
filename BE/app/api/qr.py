"""Signed Table QR token generation and validation."""

import hmac
import hashlib
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common import get_db
from app.core.config import settings
from app.models.table import RestaurantTable

router = APIRouter(prefix="/tables", tags=["QR Codes"])

class QRTokenResponse(BaseModel):
    table_id: int
    table_number: int
    section: str
    qr_token: str
    qr_url: str

class QRVerifyResponse(BaseModel):
    is_valid: bool
    table_number: int
    section: str
    is_active: bool

def _generate_qr_token(table_number: int, seed: str) -> str:
    msg = f"table_{table_number}_{seed}".encode("utf-8")
    return hmac.new(settings.SECRET_KEY.encode("utf-8"), msg, hashlib.sha256).hexdigest()[:24]

@router.get("/{table_number}/qr-token", response_model=QRTokenResponse)
async def get_table_qr_token(
    table_number: int,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve signed QR token for table printing."""
    from sqlalchemy import select
    stmt = select(RestaurantTable).where(RestaurantTable.table_number == table_number)
    res = await db.execute(stmt)
    table = res.scalars().first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found.")

    token = _generate_qr_token(table.table_number, table.qr_seed)
    return QRTokenResponse(
        table_id=table.id,
        table_number=table.table_number,
        section=table.section.value,
        qr_token=token,
        qr_url=f"/customer?table={table.table_number}&token={token}",
    )

@router.get("/{table_number}/verify-qr", response_model=QRVerifyResponse)
async def verify_table_qr(
    table_number: int,
    token: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Verify if the customer table QR code token is genuine and tamper-free."""
    from sqlalchemy import select
    stmt = select(RestaurantTable).where(RestaurantTable.table_number == table_number)
    res = await db.execute(stmt)
    table = res.scalars().first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found.")

    if not token:
        # Fallback for unvalidated direct ?table= query parameter
        return QRVerifyResponse(
            is_valid=False,
            table_number=table.table_number,
            section=table.section.value,
            is_active=table.is_active,
        )

    expected = _generate_qr_token(table.table_number, table.qr_seed)
    is_valid = hmac.compare_digest(expected, token)

    return QRVerifyResponse(
        is_valid=is_valid,
        table_number=table.table_number,
        section=table.section.value,
        is_active=table.is_active,
    )
