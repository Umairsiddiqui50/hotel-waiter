"""Comprehensive End-to-End Workflow & Integration Verification Test Suite.

Verifies:
1. Customer table QR generation & verification (is_valid, section, table_number).
2. Customer service request dispatch, 60s duplicate suppression, and routing.
3. Waiter task polling, rejection, immediate rerouting, acceptance, and completion.
4. Digital menu browsing, order placement, and mock payment verification.
5. Manager operations, live 23-table floor map, and alert feeds.
6. Security guards, JWT verification, role boundaries (401/403).
"""

import uuid
import pytest
from httpx import ASGITransport, AsyncClient
from decimal import Decimal
from app.main import app
from app.core.config import settings
from app.services.payment_gateway import gateway_service

@pytest.mark.asyncio
async def test_e2e_qr_code_workflow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Fetch genuine signed QR token for Table 7
        token_resp = await client.get("/api/v1/tables/7/qr-token")
        assert token_resp.status_code == 200
        data = token_resp.json()
        assert data["table_number"] == 7
        assert "qr_token" in data
        genuine_token = data["qr_token"]

        # 2. Verify genuine token
        verify_resp = await client.get(f"/api/v1/tables/7/verify-qr?token={genuine_token}")
        assert verify_resp.status_code == 200
        verify_data = verify_resp.json()
        assert verify_data["is_valid"] is True
        assert verify_data["table_number"] == 7
        assert verify_data["section"] == "INDOOR"

        # 3. Verify forged token is rejected
        forged_resp = await client.get("/api/v1/tables/7/verify-qr?token=fake_tampered_token")
        assert forged_resp.status_code == 200
        assert forged_resp.json()["is_valid"] is False


@pytest.mark.asyncio
async def test_e2e_customer_service_dispatch_routing_and_rejection():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Ensure at least two waiters are online for rerouting
        waiters_resp = await client.get("/api/v1/waiters")
        assert waiters_resp.status_code == 200
        all_waiters = waiters_resp.json()
        assert len(all_waiters) >= 2
        for w in all_waiters[:3]:
            await client.patch(f"/api/v1/waiters/{w['id']}/status", json={"is_online": True})

        # 1. Customer creates service request at Table 17 (fresh state)
        create_resp = await client.post("/api/v1/service-requests", json={
            "table_id": 17,
            "service_key": "water",
            "details": "Chilled water please",
        })
        assert create_resp.status_code == 201
        req_data = create_resp.json()
        req_id = req_data["id"]
        assert req_data["table_id"] == 17
        assert req_data["status"] == "ASSIGNED"

        # 2. Verify 60-second duplicate request suppression
        dup_resp = await client.post("/api/v1/service-requests", json={
            "table_id": 17,
            "service_key": "water",
            "details": "Chilled water please",
        })
        assert dup_resp.status_code == 409
        assert "already been sent" in dup_resp.json()["detail"]

        # 3. Check attempts to find which waiter was assigned
        att_resp = await client.get(f"/api/v1/service-requests/{req_id}/attempts")
        assert att_resp.status_code == 200
        attempts = att_resp.json()
        assert len(attempts) >= 1
        first_waiter_id = attempts[0]["waiter_id"]
        assert attempts[0]["status"] == "WAITING"

        # 4. Assigned waiter checks their task list via /tasks endpoint
        tasks_resp = await client.get(f"/api/v1/waiters/{first_waiter_id}/tasks")
        assert tasks_resp.status_code == 200
        tasks_data = tasks_resp.json()
        incoming = tasks_data.get("incoming", [])
        assert any(t["request_id"] == req_id for t in incoming)

        # 5. First waiter rejects the task with reason BUSY -> Immediate rerouting
        reject_resp = await client.post(
            f"/api/v1/waiters/{first_waiter_id}/service-requests/{req_id}/reject",
            json={"rejection_reason": "BUSY"}
        )
        assert reject_resp.status_code == 200

        # 6. Verify request has been rerouted to attempt 2 with a different online waiter
        att_resp2 = await client.get(f"/api/v1/service-requests/{req_id}/attempts")
        attempts2 = att_resp2.json()
        assert len(attempts2) >= 2
        second_waiter_id = attempts2[-1]["waiter_id"]
        assert second_waiter_id != first_waiter_id
        assert attempts2[-1]["status"] == "WAITING"

        # 7. Second waiter accepts the request
        accept_resp = await client.post(
            f"/api/v1/waiters/{second_waiter_id}/service-requests/{req_id}/accept"
        )
        assert accept_resp.status_code == 200
        assert accept_resp.json()["status"] == "ACCEPTED"
        assert accept_resp.json()["accepted_by"] == second_waiter_id

        # 8. Second waiter completes the request
        complete_resp = await client.post(
            f"/api/v1/waiters/{second_waiter_id}/service-requests/{req_id}/complete"
        )
        assert complete_resp.status_code == 200
        assert complete_resp.json()["status"] == "CLOSED"
        assert complete_resp.json()["closed_at"] is not None


@pytest.mark.asyncio
async def test_e2e_menu_order_and_mock_payment_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Fetch menu categories and available items
        cat_resp = await client.get("/api/v1/menu/categories")
        assert cat_resp.status_code == 200
        assert len(cat_resp.json()) >= 1

        items_resp = await client.get("/api/v1/menu/items?is_available=true")
        assert items_resp.status_code == 200
        items = items_resp.json()
        assert len(items) >= 2
        item1 = items[0]
        item2 = items[1]

        # 2. Place an order for Table 18
        order_payload = {
            "table_id": 18,
            "order_type": "DINE_IN",
            "items": [
                {"menu_item_id": item1["id"], "quantity": 2},
                {"menu_item_id": item2["id"], "quantity": 1},
            ],
            "special_instructions": "Less oil please",
        }
        order_resp = await client.post("/api/v1/orders", json=order_payload)
        assert order_resp.status_code == 201
        order = order_resp.json()
        order_id = order["id"]
        assert order["table_id"] == 18
        assert Decimal(str(order["total_amount"])) > 0
        expected_subtotal = Decimal(str(item1["price"])) * 2 + Decimal(str(item2["price"])) * 1
        assert Decimal(str(order["subtotal"])) == expected_subtotal

        # 3. Create mock payment order
        pay_order_resp = await client.post("/api/v1/payments/create", json={
            "order_id": order_id,
            "amount": float(order["total_amount"]),
            "payment_method": "UPI",
        })
        assert pay_order_resp.status_code == 201
        pay_order = pay_order_resp.json()
        assert "gateway_order_id" in pay_order
        assert str(pay_order["payment_id"]) != ""

        # 4. Verify payment via mock cryptographic verification
        valid_gateway_txn = "pay_test_txn_e2e_999888"
        signature = gateway_service.generate_test_signature(
            gateway_order_id=pay_order["gateway_order_id"],
            gateway_payment_id=valid_gateway_txn,
        )
        verify_resp = await client.post("/api/v1/payments/verify", json={
            "payment_id": pay_order["payment_id"],
            "gateway_order_id": pay_order["gateway_order_id"],
            "gateway_payment_id": valid_gateway_txn,
            "signature": signature,
        })
        assert verify_resp.status_code == 200
        receipt = verify_resp.json()
        assert receipt["payment_status"] == "SUCCESS"
        assert receipt["is_verified"] is True


@pytest.mark.asyncio
async def test_e2e_manager_console_and_security_guards():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Manager logs in
        login_resp = await client.post("/api/v1/auth/login", json={
            "identifier": "manager.dev@restaurant.local",
            "password": settings.DEV_DEFAULT_PASSWORD,
        })
        assert login_resp.status_code == 200
        mgr_token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {mgr_token}"}

        # 2. View 23 tables floor map
        tables_resp = await client.get("/api/v1/manager/tables", headers=headers)
        assert tables_resp.status_code == 200
        tables = tables_resp.json()
        assert len(tables) == 23
        indoor = [t for t in tables if t["section"] == "INDOOR"]
        outdoor = [t for t in tables if t["section"] == "OUTDOOR"]
        assert len(indoor) == 18
        assert len(outdoor) == 5

        # 3. View operational KPI dashboard
        dash_resp = await client.get("/api/v1/manager/dashboard", headers=headers)
        assert dash_resp.status_code == 200
        dash = dash_resp.json()
        assert len(dash) > 0

        # 4. View alerts feed
        alerts_resp = await client.get("/api/v1/manager/alerts", headers=headers)
        assert alerts_resp.status_code == 200
        assert isinstance(alerts_resp.json(), list)

        # 5. Security Guard: Unauthenticated access to /auth/me is rejected with 401
        unauth_resp = await client.get("/api/v1/auth/me")
        assert unauth_resp.status_code == 401

        # 6. Security Guard: Waiter cannot create menu item (403 Forbidden)
        waiter_login = await client.post("/api/v1/auth/login", json={
            "identifier": "rahul.dev@restaurant.local",
            "password": settings.DEV_DEFAULT_PASSWORD,
        })
        waiter_token = waiter_login.json()["access_token"]
        forbidden_resp = await client.post(
            "/api/v1/menu/items",
            headers={"Authorization": f"Bearer {waiter_token}"},
            json={
                "category_id": 1,
                "name": "Waiter Forbidden Dish",
                "price": "100.00",
                "is_available": True,
            }
        )
        assert forbidden_resp.status_code == 403
