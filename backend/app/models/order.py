import uuid
import enum
from decimal import Decimal
from datetime import datetime, timezone
from sqlalchemy import String, Integer, BigInteger, Numeric, DateTime, Text, Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base, GUID

class OrderType(str, enum.Enum):
    DINE_IN = "DINE_IN"
    DELIVERY = "DELIVERY"
    TAKEOUT = "TAKEOUT"

class OrderStatus(str, enum.Enum):
    PENDING_PAYMENT = "PENDING_PAYMENT"
    CONFIRMED = "CONFIRMED"
    PREPARING = "PREPARING"
    READY = "READY"
    OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY"
    SERVED = "SERVED"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"

class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    restaurant_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False)
    order_type: Mapped[OrderType] = mapped_column(Enum(OrderType, native_enum=False), default=OrderType.DINE_IN, nullable=False)
    session_id: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("dining_sessions.id", ondelete="SET NULL"), nullable=True)
    table_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("restaurant_tables.id", ondelete="SET NULL"), nullable=True)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    delivery_address_id: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("customer_addresses.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus, native_enum=False), default=OrderStatus.CONFIRMED, nullable=False)
    assigned_waiter_id: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("staff_users.id", ondelete="SET NULL"), nullable=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    delivery_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    special_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        onupdate=lambda: datetime.now(timezone.utc), 
        nullable=False
    )

    # Relationships
    restaurant = relationship("Restaurant", back_populates="orders")
    dining_session = relationship("DiningSession", back_populates="orders")
    table = relationship("RestaurantTable", back_populates="orders")
    customer = relationship("Customer", back_populates="orders")
    delivery_address = relationship("CustomerAddress", back_populates="orders")
    assigned_waiter = relationship("StaffUser", foreign_keys=[assigned_waiter_id])
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    bills = relationship("Bill", back_populates="order")
    payments = relationship("Payment", back_populates="order")

class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    menu_item_id: Mapped[int] = mapped_column(Integer, ForeignKey("menu_items.id"), nullable=False)
    item_name: Mapped[str] = mapped_column(String(150), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    # Relationships
    order = relationship("Order", back_populates="items")
    menu_item = relationship("MenuItem", back_populates="order_items")
