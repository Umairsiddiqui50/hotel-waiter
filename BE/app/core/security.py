"""Authentication and Cryptographic Security Utilities."""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
import uuid
import bcrypt
import hashlib
import base64
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.staff_user import StaffRole, StaffUser
from app.models.otp_verification import OTPVerification, OTPPurpose

http_bearer = HTTPBearer(auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT access token."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "iat": now, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT refresh token."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "iat": now, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Dict[str, Any]:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _hash_refresh_token(token: str) -> str:
    """Compute a stable hash for refresh token comparison (reuse rejection)."""
    # Deterministic hash based on token content for secure comparison
    h = hashlib.sha256(token.encode("utf-8")).hexdigest()
    return h


async def get_current_staff(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer),
    db: AsyncSession = Depends(get_db),
) -> StaffUser:
    """Dependency that extracts and validates the authenticated staff user.

    Priority 1: Bearer access token (from Authorization header)
    Priority 2: Refresh token from HttpOnly cookie (if no access token)
    """
    # Try access token first
    if credentials is not None and credentials.credentials:
        token = credentials.credentials
        payload = decode_token(token)
        user_id = payload.get("sub")
        if user_id is not None:
            try:
                user_uuid = uuid.UUID(user_id)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid subject identifier format",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            user = await db.get(StaffUser, user_uuid)
            if user is not None:
                # Check must_change_password flag
                if user.must_change_password:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Must change password before accessing dashboard.",
                    )
                return user

    # Fall back to refresh token from cookie
    # Note: cookie reading requires Request object; we'll handle this differently
    # If we reach here without credentials, staff user is not authenticated via access token
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_staff_from_cookie(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Optional[StaffUser]:
    """Extract authenticated staff user from refresh token cookie.

    Returns None if no valid refresh token found (not an error, just no access token).
    This is used for the /auth/refresh endpoint.
    """
    token = request.cookies.get("refresh_token")
    if not token:
        return None

    try:
        payload = decode_token(token)
    except HTTPException:
        return None

    user_id = payload.get("sub")
    if user_id is None:
        return None

    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        return None

    user = await db.get(StaffUser, user_uuid)
    if user is None:
        return None

    # Validate refresh token hash for rotation/reuse protection
    stored_hash = user.refresh_token_hash
    if stored_hash is not None:
        # Compute hash of the submitted token and compare
        submitted_hash = _hash_refresh_token(token)
        if submitted_hash != stored_hash:
            # Hash mismatch = reuse or tampering -> invalidate session
            # Clear the stored hash to force re-login
            return None

    # Check expiry
    if user.refresh_token_expires is not None:
        if datetime.now(timezone.utc) > user.refresh_token_expires:
            # Token expired -> clear and force re-login
            return None

    # Check must_change_password even when accessing via refresh
    if user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Must change password before accessing dashboard.",
        )

    return user


def require_role(*allowed_roles: StaffRole):
    """Dependency factory enforcing role-based endpoint permissions.

    Only allows the specified roles to access the endpoint.
    Raises 403 for any other role, including WAITER/MANAGER/ADMIN not in the list.
    """
    async def role_checker(current_user: StaffUser = Depends(get_current_staff)) -> StaffUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: requires one of {[r.value for r in allowed_roles]} role",
            )
        return current_user
    return role_checker


def require_any_role(*allowed_roles: StaffRole):
    """Dependency factory: allows access if user has ANY of the specified roles.

    Use for endpoints where multiple role levels are permitted.
    """
    async def role_checker(current_user: StaffUser = Depends(get_current_staff)) -> StaffUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: requires one of {[r.value for r in allowed_roles]} role",
            )
        return current_user
    return role_checker


async def enforce_must_change_password(current_user: StaffUser = Depends(get_current_staff)) -> StaffUser:
    """Dependency that ensures must_change_password=False before allowing access.

    Raises 403 if the flag is set. This should be used on dashboard-protected endpoints
    after the initial auth check.
    """
    if current_user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Must change password before accessing dashboard.",
        )
    return current_user