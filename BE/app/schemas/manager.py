from pydantic import BaseModel, ConfigDict, Field
from typing import Optional
import uuid
from app.models.table import TableSection

class ManagerAssignAlertRequest(BaseModel):
    waiter_id: uuid.UUID

class ManagerResolveAlertRequest(BaseModel):
    notes: Optional[str] = Field(None, max_length=255)

class ManagerDashboardKPIs(BaseModel):
    waiters_online: int
    waiters_total: int
    open_requests: int
    open_alerts: int
    active_orders: int
    missed_today: int
    avg_accept_time_sec: Optional[float] = None
    avg_service_time_min: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)

class TableMapStatusResponse(BaseModel):
    table_number: int
    section: TableSection
    is_active: bool
    status_badge: str = Field(..., description="Status badge: alert, wait, acc, or normal")
    primary_waiter_name: Optional[str] = None
    open_requests_count: int = 0

    model_config = ConfigDict(from_attributes=True)
