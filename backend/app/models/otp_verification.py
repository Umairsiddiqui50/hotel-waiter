import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Integer, DateTime, Enum
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base, GUID

class OTPPurpose(str, enum.Enum):
    CUSTOMER_LOGIN = "CUSTOMER_LOGIN"
    ORDER_VERIFY = "ORDER_VERIFY"
    STAFF_RECOVERY = "STAFF_RECOVERY"

class OTPVerification(Base):
    __tablename__ = "otp_verifications"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    target: Mapped[str] = mapped_column(String(150), index=True, nullable=False)
    otp_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    purpose: Mapped[OTPPurpose] = mapped_column(Enum(OTPPurpose, native_enum=False), nullable=False, default=OTPPurpose.CUSTOMER_LOGIN)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        nullable=False
    )
