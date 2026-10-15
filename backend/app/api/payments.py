"""Payment processing API endpoints with strict backend verification."""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common import get_db
from app.models.audit_log import ActorType, AuditLog
from app.models.order import Order, OrderStatus
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.schemas.payment import (
    PaymentCreateRequest,
    PaymentOrderResponse,
    PaymentReceiptResponse,
    PaymentVerifyRequest,
)
from app.services.payment_gateway import gateway_service

router = APIRouter(prefix="/payments", tags=["Payments"])

@router.post("/create", response_model=PaymentOrderResponse, status_code=status.HTTP_201_CREATED)
async def create_payment_order(
    payload: PaymentCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Initialize a backend payment order with Razorpay/Gateway."""
    order = await db.get(Order, payload.order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order was not found.")

    # Call gateway service to create gateway-side order
    gw_data = gateway_service.create_order(
        amount=order.total_amount,
        currency="INR",
        receipt=f"rcpt_ord_{order.id}",
    )

    payment = Payment(
        id=uuid.uuid4(),
        order_id=order.id,
        amount=order.total_amount,
        payment_method=payload.payment_method,
        payment_status=PaymentStatus.PENDING,
        gateway_name=gw_data["gateway_name"],
        gateway_transaction_id=gw_data["gateway_order_id"],
    )
    db.add(payment)
    await db.commit()
    await db.refresh(payment)

    return PaymentOrderResponse(
        payment_id=payment.id,
        order_id=order.id,
        amount=payment.amount,
        currency="INR",
        gateway_order_id=gw_data["gateway_order_id"],
        gateway_key_id=gw_data["key_id"],
        gateway_name=gw_data["gateway_name"],
        is_test_mode=gw_data["is_test_mode"],
    )

@router.post("/verify", response_model=PaymentReceiptResponse)
async def verify_payment(
    payload: PaymentVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    """Verify cryptographic signature on backend before marking order paid."""
    payment = await db.get(Payment, payload.payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found.")

    if payment.payment_status == PaymentStatus.SUCCESS:
        return PaymentReceiptResponse(
            payment_id=payment.id,
            order_id=payment.order_id,
            amount=payment.amount,
            payment_method=payment.payment_method,
            payment_status=payment.payment_status,
            gateway_transaction_id=payment.gateway_transaction_id or "",
            paid_at=payment.paid_at or datetime.now(timezone.utc),
            is_verified=True,
        )

    # Cryptographic signature verification
    is_valid = gateway_service.verify_payment_signature(
        gateway_order_id=payload.gateway_order_id,
        gateway_payment_id=payload.gateway_payment_id,
        signature=payload.signature,
    )

    if not is_valid:
        payment.payment_status = PaymentStatus.FAILED
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cryptographic payment signature verification failed.",
        )

    now = datetime.now(timezone.utc)
    payment.payment_status = PaymentStatus.SUCCESS
    payment.gateway_signature = payload.signature
    payment.gateway_transaction_id = payload.gateway_payment_id
    payment.paid_at = now

    # Update associated order
    if payment.order_id:
        order = await db.get(Order, payment.order_id)
        if order:
            order.status = OrderStatus.CONFIRMED

    # Create immutable audit log entry with explicit ID sequence for SQLite compatibility
    from sqlalchemy import func
    max_audit_id = await db.scalar(select(func.coalesce(func.max(AuditLog.id), 0)))
    audit = AuditLog(
        id=(max_audit_id or 0) + 1,
        restaurant_id=payment.order.restaurant_id if payment.order else uuid.UUID("62b2da79-1735-4189-9400-c430b1edf731"),
        actor_type=ActorType.CUSTOMER,
        action="PAYMENT_VERIFIED",
        target_entity="Payment",
        target_id=str(payment.id),
        details={
            "order_id": payment.order_id,
            "amount": float(payment.amount),
            "gateway": payment.gateway_name,
            "transaction_id": payload.gateway_payment_id,
        },
    )
    db.add(audit)

    await db.commit()
    await db.refresh(payment)

    return PaymentReceiptResponse(
        payment_id=payment.id,
        order_id=payment.order_id,
        amount=payment.amount,
        payment_method=payment.payment_method,
        payment_status=payment.payment_status,
        gateway_transaction_id=payment.gateway_transaction_id,
        paid_at=payment.paid_at,
        is_verified=True,
    )
