import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Integer, BigInteger, DateTime, Enum, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base, GUID

class RequestStatus(str, enum.Enum):
    PENDING = "PENDING"
    ASSIGNED = "ASSIGNED"
    ESCALATED = "ESCALATED"
    ACCEPTED = "ACCEPTED"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"
    FAILED = "FAILED"

class AttemptStatus(str, enum.Enum):
    WAITING = "WAITING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    MISSED = "MISSED"
    CANCELLED = "CANCELLED"

class ManagerAlertType(str, enum.Enum):
    NONE = "NONE"       # 0 online waiters
    ALL = "ALL"         # All 3 attempts failed
    LIMIT = "LIMIT"     # Resend limit reached

class ServiceRequest(Base):
    __tablename__ = "service_requests"

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("dining_sessions.id", ondelete="CASCADE"), nullable=False)
    table_id: Mapped[int] = mapped_column(Integer, ForeignKey("restaurant_tables.id", ondelete="CASCADE"), nullable=False)
    service_key: Mapped[str] = mapped_column(String(50), nullable=False)
    details: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    status: Mapped[RequestStatus] = mapped_column(Enum(RequestStatus, native_enum=False), default=RequestStatus.PENDING, nullable=False)
    accepted_by: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("staff_users.id", ondelete="SET NULL"), nullable=True)
    resend_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        nullable=False
    )
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_service_requests_table_status", "table_id", "status"),
    )

    # Relationships
    dining_session = relationship("DiningSession", back_populates="service_requests")
    table = relationship("RestaurantTable", back_populates="service_requests")
    accepted_waiter = relationship("StaffUser", foreign_keys=[accepted_by])
    attempts = relationship("ServiceRequestAttempt", back_populates="request", cascade="all, delete-orphan")
    manager_alerts = relationship("ManagerAlert", back_populates="request", cascade="all, delete-orphan")

class ServiceRequestAttempt(Base):
    __tablename__ = "service_request_attempts"

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=False)
    waiter_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("staff_users.id", ondelete="CASCADE"), nullable=False)
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[AttemptStatus] = mapped_column(Enum(AttemptStatus, native_enum=False), default=AttemptStatus.WAITING, nullable=False)
    rejection_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)
    timeout_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_service_request_attempts_waiter_status_expires", "waiter_id", "status", "expires_at"),
    )

    # Relationships
    request = relationship("ServiceRequest", back_populates="attempts")
    waiter = relationship("StaffUser", back_populates="assigned_attempts")

class ManagerAlert(Base):
    __tablename__ = "manager_alerts"

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=False)
    alert_type: Mapped[ManagerAlertType] = mapped_column(Enum(ManagerAlertType, native_enum=False), nullable=False)
    is_open: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("staff_users.id", ondelete="SET NULL"), nullable=True)
    assigned_waiter_id: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("staff_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    request = relationship("ServiceRequest", back_populates="manager_alerts")
    resolver = relationship("StaffUser", foreign_keys=[resolved_by])
    assigned_waiter = relationship("StaffUser", foreign_keys=[assigned_waiter_id])
