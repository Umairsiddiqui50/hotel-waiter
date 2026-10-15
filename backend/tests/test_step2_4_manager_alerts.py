"""Manager alert assignment and resolution API tests for Step 2.4."""

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
                    is_online=True,
                    push_enabled=True,
                    last_assigned_seq=0,
                    accepted_count=0,
                    missed_count=0,
                    rejected_count=0,
                    streak=0,
                )
            )
        manager_id = uuid.uuid4()
        session.add(
            StaffUser(
                id=manager_id,
                restaurant_id=rest_id,
                name="Manager",
                email="manager@grandbistro.com",
                phone="+919000000099",
                password_hash="test_hash",
                role=StaffRole.MANAGER,
                is_online=True,
                push_enabled=True,
            )
        )
        await session.commit()

    async def override_get_db():
        async with session_factory() as db_session:
            db_session.expire_on_commit = False
            yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        client._manager_id = manager_id
        client._waiter_ids = waiter_ids
        yield client

    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.mark.asyncio
async def test_manager_alert_assign_and_resolve(api_client):
    manager_id = api_client._manager_id
    waiter_ids = api_client._waiter_ids

    for waiter_id in waiter_ids:
        response = await api_client.patch(
            f"/api/v1/waiters/{waiter_id}/status",
            json={"is_online": False},
        )
        assert response.status_code == 200

    failed = await api_client.post(
        "/api/v1/service-requests",
        json={"table_id": 12, "service_key": "water", "details": "Cold"},
    )
    assert failed.status_code == 201
    assert failed.json()["status"] == "FAILED"

    alerts = await api_client.get("/api/v1/manager/alerts?is_open=true")
    assert alerts.status_code == 200
    alert_list = alerts.json()
    assert len(alert_list) == 1
    alert_id = alert_list[0]["id"]

    online = await api_client.patch(
        f"/api/v1/waiters/{waiter_ids[0]}/status",
        json={"is_online": True},
    )
    assert online.status_code == 200

    assigned = await api_client.post(
        f"/api/v1/manager/{manager_id}/alerts/{alert_id}/assign",
        json={"waiter_id": str(waiter_ids[0])},
    )
    assert assigned.status_code == 200
    assert assigned.json()["status"] in ("ASSIGNED", "ESCALATED")

    await api_client.patch(
        f"/api/v1/waiters/{waiter_ids[0]}/status",
        json={"is_online": False},
    )

    second_failed = await api_client.post(
        "/api/v1/service-requests",
        json={"table_id": 13, "service_key": "water", "details": "Cold"},
    )
    assert second_failed.status_code == 201

    second_alerts = await api_client.get("/api/v1/manager/alerts?is_open=true")
    assert second_alerts.status_code == 200
    second_alert_list = second_alerts.json()
    matching_alerts = [alert for alert in second_alert_list if alert.get("request_id") == second_failed.json()["id"]]
    assert matching_alerts
    second_alert_id = matching_alerts[0]["id"]

    resolved = await api_client.post(
        f"/api/v1/manager/{manager_id}/alerts/{second_alert_id}/resolve",
        json={"notes": "Resolved in test"},
    )
    assert resolved.status_code == 200
    assert resolved.json()["is_open"] is False

    request_read = await api_client.get(f"/api/v1/service-requests/{second_failed.json()['id']}")
    assert request_read.status_code == 200
    assert request_read.json()["status"] == "CANCELLED"
