import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, BigInteger, DateTime, Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from DB.connection import Base, GUID, CompatibleJSON

class ActorType(str, enum.Enum):
    CUSTOMER = "CUSTOMER"
    STAFF = "STAFF"
    SYSTEM = "SYSTEM"

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    restaurant_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False)
    actor_type: Mapped[ActorType] = mapped_column(Enum(ActorType, native_enum=False), nullable=False)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(GUID, nullable=True)
    action: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    target_entity: Mapped[str] = mapped_column(String(50), nullable=False)
    target_id: Mapped[str] = mapped_column(String(100), nullable=False)
    details: Mapped[dict] = mapped_column(CompatibleJSON, default=dict, nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        nullable=False
    )

    # Relationships
    restaurant = relationship("Restaurant", back_populates="audit_logs")
