import pytest
import uuid
from datetime import datetime, timezone
from pydantic import ValidationError
import httpx

from app.main import app
from app.models.staff_user import StaffRole
from app.models.table import TableSection, SessionStatus
from app.models.service_request import RequestStatus, AttemptStatus, ManagerAlertType
from app.schemas import (
    HealthCheckResponse,
    CustomerCreate,
    CustomerResponse,
    CustomerAddressCreate,
    CustomerAddressResponse,
    DiningSessionResponse,
    ServiceRequestCreate,
    ServiceRequestResponse,
    ServiceRequestAttemptResponse,
    ManagerAlertResponse,
    WaiterToggleStatusRequest,
    WaiterTogglePushRequest,
    WaiterRejectRequest,
    StaffUserResponse,
    ManagerAssignAlertRequest,
    ManagerResolveAlertRequest,
    ManagerDashboardKPIs,
    TableMapStatusResponse,
)

# ---------------------------------------------------------------------------
# 1. Application Startup & Health Check Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_health_check_endpoint():
    """Verify health check endpoint returns 200, healthy status, and database connectivity."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["database"] == "connected"
        assert data["database_dialect"] == "sqlite"
        assert data["version"] == "1.0.0"

@pytest.mark.asyncio
async def test_api_v1_health_check_endpoint():
    """Verify /api/v1/health alias endpoint returns identical health response."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["database"] == "connected"

# ---------------------------------------------------------------------------
# 2. Customer & Dining Session Schema Tests
# ---------------------------------------------------------------------------

def test_customer_schema_valid():
    """Test valid CustomerCreate and CustomerResponse instantiation."""
    cust_data = {
        "phone": "+919876543210",
        "email": "customer@example.com",
        "name": "Aarav Sharma",
    }
    cust_create = CustomerCreate(**cust_data)
    assert cust_create.name == "Aarav Sharma"
    assert cust_create.email == "customer@example.com"

    cust_resp = CustomerResponse(
        id=uuid.uuid4(),
        phone=cust_data["phone"],
        email=cust_data["email"],
        name=cust_data["name"],
        is_phone_verified=True,
        is_email_verified=False,
        created_at=datetime.now(timezone.utc),
    )
    assert cust_resp.is_phone_verified is True

def test_customer_schema_invalid_email():
    """Test CustomerCreate rejects invalid email format."""
    with pytest.raises(ValidationError):
        CustomerCreate(
            phone="9876543210",
            email="not-an-email-address",
            name="Test User"
        )

def test_customer_address_valid():
    """Test valid CustomerAddressCreate."""
    addr = CustomerAddressCreate(
        recipient_name="Priya Patel",
        recipient_phone="9876543211",
        address_line1="Flat 402, Green Towers",
        city="Mumbai",
        postal_code="400001",
        is_default=True
    )
    assert addr.city == "Mumbai"
    assert addr.is_default is True

def test_customer_address_invalid_missing_required():
    """Test CustomerAddressCreate rejects missing required recipient_phone."""
    with pytest.raises(ValidationError):
        CustomerAddressCreate(
            recipient_name="Priya Patel",
            # recipient_phone missing
            address_line1="Flat 402",
            city="Mumbai",
            postal_code="400001"
        )

def test_dining_session_response_valid():
    """Test DiningSessionResponse schema."""
    session_id = uuid.uuid4()
    session_resp = DiningSessionResponse(
        id=session_id,
        table_id=7,
        session_token="token_abc_123",
        customer_id=None,
        primary_waiter_id=None,
        status=SessionStatus.ACTIVE,
        opened_at=datetime.now(timezone.utc),
        closed_at=None
    )
    assert session_resp.table_id == 7
    assert session_resp.status == SessionStatus.ACTIVE

# ---------------------------------------------------------------------------
# 3. Service Request & Alert Schema Tests
# ---------------------------------------------------------------------------

def test_service_request_schema_valid():
    """Test valid ServiceRequestCreate and ServiceRequestResponse."""
    req_create = ServiceRequestCreate(
        table_id=7,
        service_key="water",
        details="Cold"
    )
    assert req_create.table_id == 7
    assert req_create.service_key == "water"

    req_resp = ServiceRequestResponse(
        id=501,
        session_id=uuid.uuid4(),
        table_id=7,
        service_key="water",
        details="Cold",
        status=RequestStatus.PENDING,
        accepted_by=None,
        resend_count=0,
        created_at=datetime.now(timezone.utc),
        accepted_at=None,
        closed_at=None
    )
    assert req_resp.id == 501
    assert req_resp.status == RequestStatus.PENDING

def test_service_request_invalid_table():
    """Test ServiceRequestCreate rejects invalid table_id (< 1)."""
    with pytest.raises(ValidationError):
        ServiceRequestCreate(
            table_id=0,  # Invalid: table_id ge=1
            service_key="water"
        )

def test_service_request_invalid_empty_key():
    """Test ServiceRequestCreate rejects empty service_key."""
    with pytest.raises(ValidationError):
        ServiceRequestCreate(
            table_id=5,
            service_key=""  # Invalid: min_length=1
        )

def test_manager_alert_response_valid():
    """Test ManagerAlertResponse schema."""
    alert_resp = ManagerAlertResponse(
        id=1,
        request_id=501,
        alert_type=ManagerAlertType.NONE,
        is_open=True,
        resolved_by=None,
        assigned_waiter_id=None,
        created_at=datetime.now(timezone.utc),
        resolved_at=None
    )
    assert alert_resp.alert_type == ManagerAlertType.NONE
    assert alert_resp.is_open is True

# ---------------------------------------------------------------------------
# 4. Waiter Schema Tests
# ---------------------------------------------------------------------------

def test_waiter_toggle_requests_valid():
    """Test waiter toggle online/push schemas."""
    online_req = WaiterToggleStatusRequest(is_online=True)
    assert online_req.is_online is True

    push_req = WaiterTogglePushRequest(push_enabled=False)
    assert push_req.push_enabled is False

def test_waiter_reject_request_valid():
    """Test WaiterRejectRequest with reason."""
    reject_req = WaiterRejectRequest(rejection_reason="Busy")
    assert reject_req.rejection_reason == "Busy"

def test_waiter_reject_request_invalid_empty():
    """Test WaiterRejectRequest rejects empty reason string."""
    with pytest.raises(ValidationError):
        WaiterRejectRequest(rejection_reason="")

def test_staff_user_response_valid():
    """Test StaffUserResponse schema."""
    staff_resp = StaffUserResponse(
        id=uuid.uuid4(),
        restaurant_id=uuid.uuid4(),
        name="Rahul",
        email="rahul.dev@restaurant.local",
        phone="9000000001",
        role=StaffRole.WAITER,
        is_online=False,
        push_enabled=True,
        last_assigned_seq=0,
        accepted_count=5,
        missed_count=1,
        rejected_count=0,
        streak=0,
        created_at=datetime.now(timezone.utc)
    )
    assert staff_resp.name == "Rahul"
    assert staff_resp.role == StaffRole.WAITER

# ---------------------------------------------------------------------------
# 5. Manager Schema Tests
# ---------------------------------------------------------------------------

def test_manager_assign_alert_valid():
    """Test ManagerAssignAlertRequest with valid UUID."""
    wid = uuid.uuid4()
    req = ManagerAssignAlertRequest(waiter_id=wid)
    assert req.waiter_id == wid

def test_manager_assign_alert_invalid_uuid():
    """Test ManagerAssignAlertRequest rejects non-UUID string."""
    with pytest.raises(ValidationError):
        ManagerAssignAlertRequest(waiter_id="not-a-valid-uuid")

def test_manager_kpis_valid():
    """Test ManagerDashboardKPIs schema."""
    kpis = ManagerDashboardKPIs(
        waiters_online=4,
        waiters_total=5,
        open_requests=2,
        open_alerts=0,
        active_orders=3,
        missed_today=1,
        avg_accept_time_sec=14.5,
        avg_service_time_min=6.2
    )
    assert kpis.waiters_online == 4
    assert kpis.avg_accept_time_sec == 14.5

def test_table_map_status_valid():
    """Test TableMapStatusResponse schema."""
    tmap = TableMapStatusResponse(
        table_number=7,
        section=TableSection.INDOOR,
        is_active=True,
        status_badge="acc",
        primary_waiter_name="Rahul",
        open_requests_count=1
    )
    assert tmap.table_number == 7
    assert tmap.status_badge == "acc"
