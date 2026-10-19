"""Database Connection Engine & Dialect Custom Types."""

import os
import uuid
from typing import Any
from sqlalchemy import JSON, Dialect, String, TypeDecorator, text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from dotenv import load_dotenv

_env_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
if os.path.exists(_env_file):
    load_dotenv(_env_file)

# Database URL from environment or fallback to hotel_waiter.db
DATABASE_URL = os.getenv("DATABASE_URL", "mysql+aiomysql://root:8094271418@127.0.0.1:3306/hotel_waiter_db")

# Guarantee consistent SQLite path resolution regardless of caller working directory
if DATABASE_URL.startswith("sqlite+aiosqlite:///./"):
    relative_file = DATABASE_URL.replace("sqlite+aiosqlite:///./", "")
    # Search in DB/, backend/, or current directory
    candidates = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), relative_file)),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", relative_file)),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", relative_file)),
    ]
    resolved = None
    for cand in candidates:
        if os.path.exists(cand):
            resolved = cand
            break
    if not resolved:
        resolved = candidates[0]
    DATABASE_URL = f"sqlite+aiosqlite:///{resolved.replace(chr(92), '/')}"

engine: AsyncEngine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=True,
)

class Base(DeclarativeBase):
    """Declarative base class for all SQLAlchemy domain models."""
    pass

class GUID(TypeDecorator):
    """Platform-independent GUID/UUID type.
    Uses native UUID on PostgreSQL, and CHAR(36) on SQLite.
    """
    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Dialect) -> Any:
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return str(value)
        return str(uuid.UUID(str(value)))

    def process_result_value(self, value: Any, dialect: Dialect) -> Any:
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(str(value))

class CompatibleJSON(TypeDecorator):
    """Platform-independent JSON type compatible across SQLite and PostgreSQL."""
    impl = JSON
    cache_ok = True
