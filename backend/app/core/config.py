import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

class Settings(BaseSettings):
    PROJECT_NAME: str = "Smart Table Service"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Database Settings
    POSTGRES_DB: str = "hotel_waiter_db"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    DATABASE_URL: str = "sqlite+aiosqlite:///./hotel_waiter.db"

    # Security & Tokens
    SECRET_KEY: str = "dev_secret_key_change_in_production_1234567890abcdef"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # OTP Settings
    OTP_EXPIRY_SECONDS: int = 300
    OTP_MAX_ATTEMPTS: int = 5

    # Dev Seed Configuration
    DEV_DEFAULT_PASSWORD: str = "DevOnly_ChangeMe!123"

    @field_validator("DATABASE_URL", mode="after")
    @classmethod
    def resolve_sqlite_path(cls, v: str) -> str:
        # Guarantee consistent SQLite path inside backend/ regardless of caller cwd
        if v.startswith("sqlite+aiosqlite:///./"):
            relative_file = v.replace("sqlite+aiosqlite:///./", "")
            abs_path = os.path.abspath(os.path.join(BACKEND_DIR, relative_file)).replace("\\", "/")
            return f"sqlite+aiosqlite:///{abs_path}"
        return v

    model_config = SettingsConfigDict(
        env_file=os.path.join(BACKEND_DIR, ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
