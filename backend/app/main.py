import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine, get_db
from app.api.router import api_router
from app.schemas.common import HealthCheckResponse

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Application startup: verify database connection
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
    description="Smart Table Service Restaurant Platform API",
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

# Static file and SPA Website mount
frontend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

if os.path.exists(os.path.join(frontend_root, "index.html")):
    @app.get("/", include_in_schema=False)
    async def serve_index():
        return FileResponse(os.path.join(frontend_root, "index.html"))

    if os.path.exists(os.path.join(frontend_root, "src")):
        app.mount("/src", StaticFiles(directory=os.path.join(frontend_root, "src")), name="src")
    if os.path.exists(os.path.join(frontend_root, "design.css")):
        @app.get("/design.css", include_in_schema=False)
        async def serve_css():
            return FileResponse(os.path.join(frontend_root, "design.css"))
