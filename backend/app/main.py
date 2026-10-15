from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine, get_db
from app.api.router import api_router
from app.schemas.common import HealthCheckResponse

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Application startup: verify database connection
    # Note: Background ticker workers and WebSockets are deferred to later steps per Step 2.2 boundaries.
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as e:
        print(f"[STARTUP WARNING] Database connection check: {e}")
    yield
    # Application shutdown: clean up connection pool
    await engine.dispose()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description=(
        "Temporary development-only API. Waiter and manager path identifiers are "
        "NOT authentication and must not be exposed in a public demo."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Configuration for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

@app.get(
    "/health",
    response_model=HealthCheckResponse,
    status_code=status.HTTP_200_OK,
    tags=["System"],
    summary="Root Health Check",
)
@app.get(
    "/api/v1/health",
    response_model=HealthCheckResponse,
    status_code=status.HTTP_200_OK,
    tags=["System"],
    summary="API v1 Health Check",
)
async def health_check(db: AsyncSession = Depends(get_db)):
    """Health check endpoint verifying application status and database connectivity."""
    db_status = "connected"
    try:
        await db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    return HealthCheckResponse(
        status="healthy" if db_status == "connected" else "degraded",
        environment=settings.ENVIRONMENT,
        database=db_status,
        database_dialect=engine.dialect.name,
        version="1.0.0",
        timestamp=datetime.now(timezone.utc),
    )
