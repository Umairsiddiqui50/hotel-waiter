import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Integer, DateTime, Enum, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base, GUID

class TableSection(str, enum.Enum):
    INDOOR = "INDOOR"
    OUTDOOR = "OUTDOOR"

class SessionStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    BILLED = "BILLED"
    CLOSED = "CLOSED"

class RestaurantTable(Base):
    __tablename__ = "restaurant_tables"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurant_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False)
    table_number: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    section: Mapped[TableSection] = mapped_column(Enum(TableSection, native_enum=False), default=TableSection.INDOOR, nullable=False)
    qr_seed: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (
        UniqueConstraint("restaurant_id", "table_number", name="uq_restaurant_table_number"),
    )

    # Relationships
    restaurant = relationship("Restaurant", back_populates="tables")
    dining_sessions = relationship("DiningSession", back_populates="table", cascade="all, delete-orphan")
    service_requests = relationship("ServiceRequest", back_populates="table")
    orders = relationship("Order", back_populates="table")

class DiningSession(Base):
    __tablename__ = "dining_sessions"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    table_id: Mapped[int] = mapped_column(Integer, ForeignKey("restaurant_tables.id", ondelete="CASCADE"), nullable=False)
    session_token: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    primary_waiter_id: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("staff_users.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[SessionStatus] = mapped_column(Enum(SessionStatus, native_enum=False), default=SessionStatus.ACTIVE, nullable=False)
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        nullable=False
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    table = relationship("RestaurantTable", back_populates="dining_sessions")
    customer = relationship("Customer", back_populates="dining_sessions")
    primary_waiter = relationship("StaffUser")
    service_requests = relationship("ServiceRequest", back_populates="dining_session", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="dining_session")
    bills = relationship("Bill", back_populates="dining_session")
