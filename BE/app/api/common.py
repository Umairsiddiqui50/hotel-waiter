"""Common FastAPI dependencies and error translation for API routes."""

from typing import AsyncGenerator

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    # Central FastAPI dependency used by every route so transaction/session
    # behaviour stays consistent with the rest of the backend.
    async with AsyncSessionLocal() as session:
        session.expire_on_commit = False
        try:
            yield session
        finally:
            await session.close()


def domain_error_to_http(exc: ValueError) -> HTTPException:
    """Convert expected domain-layer ValueErrors to stable API responses.

    Domain messages remain readable, but they are already application-level
    messages rather than SQL text, connection details, credentials, or tracebacks.
    """
    message = str(exc)
    lowered = message.lower()

    if "not found" in lowered:
        status_code = 404
    elif any(
        phrase in lowered
        for phrase in (
            "already been sent",
            "cannot be cancelled",
            "cooldown active",
            "currently with a waiter",
            "already accepted",
            "already handled",
            "expired",
            "limit reached",
            "not currently assigned",
            "no active waiting attempt",
            "not online",
        )
    ):
        status_code = 409
    else:
        status_code = 400

    return HTTPException(status_code=status_code, detail=message)
