"""Integration tests for Auth, Role Guards, Menu, and Orders."""

import pytest
from httpx import ASGITransport, AsyncClient
from decimal import Decimal
from app.main import app
from app.core.config import settings

@pytest.mark.asyncio
async def test_staff_login_waiter_success():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Login with seeded waiter Rahul
        resp = await client.post("/api/v1/auth/login", json={
            "identifier": "rahul.dev@restaurant.local",
            "password": settings.DEV_DEFAULT_PASSWORD,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["role"] == "WAITER"
        assert data["name"] == "Rahul"

@pytest.mark.asyncio
async def test_staff_login_manager_success():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Login with seeded manager Vikram
        resp = await client.post("/api/v1/auth/login", json={
            "identifier": "manager.dev@restaurant.local",
            "password": settings.DEV_DEFAULT_PASSWORD,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["role"] == "MANAGER"

@pytest.mark.asyncio
async def test_staff_login_invalid_password():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/auth/login", json={
            "identifier": "rahul.dev@restaurant.local",
            "password": "WrongPassword123!",
        })
        assert resp.status_code == 401

@pytest.mark.asyncio
async def test_role_guard_waiter_cannot_create_menu_item():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Waiter login
        login_resp = await client.post("/api/v1/auth/login", json={
            "identifier": "rahul.dev@restaurant.local",
            "password": settings.DEV_DEFAULT_PASSWORD,
        })
        token = login_resp.json()["access_token"]

        # Attempt to create menu item (admin/manager only)
        create_resp = await client.post(
            "/api/v1/menu/items",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "category_id": 1,
                "name": "Unauthorized Dish",
                "price": "250.00",
                "is_available": True,
            }
        )
        assert create_resp.status_code == 403

@pytest.mark.asyncio
async def test_public_menu_reading():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Public categories
        cat_resp = await client.get("/api/v1/menu/categories")
        assert cat_resp.status_code == 200
        categories = cat_resp.json()
        assert len(categories) >= 2

        # Public items
        items_resp = await client.get("/api/v1/menu/items")
        assert items_resp.status_code == 200
        items = items_resp.json()
        assert len(items) >= 9

@pytest.mark.asyncio
async def test_server_side_order_pricing_calculation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Fetch available items
        items_resp = await client.get("/api/v1/menu/items?is_available=true")
        assert items_resp.status_code == 200
        items = items_resp.json()
        assert len(items) >= 1
        first_item = items[0]

        # Place order on table 7
        order_payload = {
            "table_id": 7,
            "order_type": "DINE_IN",
            "items": [
                {"menu_item_id": first_item["id"], "quantity": 2}
            ],
            "special_instructions": "Less spicy please",
        }
        order_resp = await client.post("/api/v1/orders", json=order_payload)
        assert order_resp.status_code == 201
        order = order_resp.json()

        expected_subtotal = Decimal(str(first_item["price"])) * 2
        expected_tax = (expected_subtotal * Decimal("0.05")).quantize(Decimal("0.01"))
        expected_total = expected_subtotal + expected_tax

        assert Decimal(str(order["subtotal"])) == expected_subtotal
        assert Decimal(str(order["tax_amount"])) == expected_tax
        assert Decimal(str(order["total_amount"])) == expected_total
        assert order["status"] == "CONFIRMED"
        assert len(order["items"]) == 1
        assert order["items"][0]["quantity"] == 2
