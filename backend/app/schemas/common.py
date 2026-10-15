from pydantic import BaseModel, ConfigDict
from typing import Optional, Any
from datetime import datetime

class HealthCheckResponse(BaseModel):
    status: str
    environment: str
    database: str
    database_dialect: str
    version: str
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)

class StandardResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)
