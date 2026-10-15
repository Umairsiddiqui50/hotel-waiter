"""Phase 0 integration endpoint tests: roster discovery and request cancellation."""

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.api.common import get_db
from app.core.database import Base
from app.main import app
from app.models.restaurant import Restaurant
from app.models.staff_user import StaffRole, StaffUser
from app.models.table import RestaurantTable, TableSection


@pytest_asyncio.fixture
async def api_client():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        bind=engine,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
        class_=AsyncSession,
    )

    rest_id = uuid.uuid4()
    waiter_ids = []
    async with session_factory() as session:
        session.add(Restaurant(id=rest_id, name="Grand Bistro", slug="grand-bistro", is_active=True))
        for number in range(1, 24):
            section = TableSection.INDOOR if number <= 18 else TableSection.OUTDOOR
            session.add(
                RestaurantTable(
                    id=number,
                    restaurant_id=rest_id,
                    table_number=number,
                    section=section,
                    qr_seed=f"qr_seed_t{number}",
                    is_active=True,
                )
            )
        for index in range(5):
            waiter_id = uuid.uuid4()
            waiter_ids.append(waiter_id)
            session.add(
                StaffUser(
                    id=waiter_id,
                    restaurant_id=rest_id,
                    name=f"Waiter {index}",
                    email=f"waiter{index}@grandbistro.com",
                    phone=f"+9190000000{index}",
                    password_hash="test_hash",
                    role=StaffRole.WAITER,
                    is_online=False,
                    push_enabled=True,
                    last_assigned_seq=0,
                    accepted_count=0,
                    missed_count=0,
                    rejected_count=0,
                    streak=0,
                )
            )
        await session.commit()

    async def override_get_db():
        async with session_factory() as db_session:
            db_session.expire_on_commit = False
            yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        client._restaurant_id = rest_id
        client._waiter_ids = waiter_ids
        yield client

    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.mark.asyncio
async def test_list_waiters(api_client):
    response = await api_client.get(f"/api/v1/waiters?restaurant_id={api_client._restaurant_id}")
    assert response.status_code == 200
    assert len(response.json()) == 5

    all_waiters = await api_client.get("/api/v1/waiters")
    assert all_waiters.status_code == 200
    assert len(all_waiters.json()) == 5


@pytest.mark.asyncio
async def test_cancel_failed_request(api_client):
    response = await api_client.post(
        "/api/v1/service-requests",
        json={"table_id": 5, "service_key": "water", "details": "Cold"},
    )
    assert response.status_code == 201
    assert response.json()["status"] == "FAILED"
    request_id = response.json()["id"]

    alerts = await api_client.get("/api/v1/manager/alerts?is_open=true")
    assert alerts.status_code == 200
    assert len(alerts.json()) == 1

    cancelled = await api_client.post(
        f"/api/v1/service-requests/{request_id}/cancel",
        json={"table_id": 5},
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "CANCELLED"

    alerts_after = await api_client.get("/api/v1/manager/alerts?is_open=true")
    assert alerts_after.status_code == 200
    assert alerts_after.json() == []


@pytest.mark.asyncio
async def test_cancel_accepted_request_rejected(api_client):
    waiter_id = api_client._waiter_ids[0]
    await api_client.patch(f"/api/v1/waiters/{waiter_id}/status", json={"is_online": True})

    create = await api_client.post(
        "/api/v1/service-requests",
        json={"table_id": 6, "service_key": "bill", "details": "Cash"},
    )
    assert create.status_code == 201
    assert create.json()["status"] == "ASSIGNED"
    request_id = create.json()["id"]

    attempts = await api_client.get(f"/api/v1/service-requests/{request_id}/attempts")
    assert attempts.status_code == 200

    accept = await api_client.post(
        f"/api/v1/waiters/{waiter_id}/service-requests/{request_id}/accept"
    )
    assert accept.status_code == 200
    assert accept.json()["status"] == "ACCEPTED"

    cancelled = await api_client.post(
        f"/api/v1/service-requests/{request_id}/cancel",
        json={"table_id": 6},
    )
    assert cancelled.status_code == 409
    assert "Accepted" in cancelled.json()["detail"]

    still_accepted = await api_client.get(f"/api/v1/service-requests/{request_id}")
    assert still_accepted.status_code == 200
    assert still_accepted.json()["status"] == "ACCEPTED"


@pytest.mark.asyncio
async def test_cancel_idempotent_and_table_guard(api_client):
    create = await api_client.post(
        "/api/v1/service-requests",
        json={"table_id": 7, "service_key": "water", "details": "Cold"},
    )
    assert create.status_code == 201
    request_id = create.json()["id"]

    missing_table = await api_client.post(
        f"/api/v1/service-requests/{request_id}/cancel",
        json={"table_id": 9},
    )
    assert missing_table.status_code == 404

    first = await api_client.post(f"/api/v1/service-requests/{request_id}/cancel")
    assert first.status_code == 200
    assert first.json()["status"] == "CANCELLED"

    second = await api_client.post(f"/api/v1/service-requests/{request_id}/cancel")
    assert second.status_code == 200
    assert second.json()["status"] == "CANCELLED"

    missing_request = await api_client.post(
        "/api/v1/service-requests/999999/cancel",
        json={"table_id": 7},
    )
    assert missing_request.status_code == 404


@pytest.mark.asyncio
async def test_cancel_waiting_attempts(api_client):
    waiter_id = api_client._waiter_ids[1]
    await api_client.patch(f"/api/v1/waiters/{waiter_id}/status", json={"is_online": True})

    create = await api_client.post(
        "/api/v1/service-requests",
        json={"table_id": 8, "service_key": "spt", "details": "Salt"},
    )
    assert create.status_code == 201
    assert create.json()["status"] == "ASSIGNED"
    request_id = create.json()["id"]

    cancelled = await api_client.post(
        f"/api/v1/service-requests/{request_id}/cancel",
        json={"table_id": 8},
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "CANCELLED"

    attempts = await api_client.get(f"/api/v1/service-requests/{request_id}/attempts")
    assert attempts.status_code == 200
    assert any(attempt["status"] == "CANCELLED" for attempt in attempts.json())
