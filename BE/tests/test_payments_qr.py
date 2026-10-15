"""Tests for Payment Gateway Integration, Audit Logging, and Signed QR Tokens."""

import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.services.payment_gateway import gateway_service

@pytest.mark.asyncio
async def test_signed_qr_token_generation_and_validation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Fetch genuine signed QR token for Table 7
        token_resp = await client.get("/api/v1/tables/7/qr-token")
        assert token_resp.status_code == 200
        token_data = token_resp.json()
        assert token_data["table_number"] == 7
        assert "qr_token" in token_data
        genuine_token = token_data["qr_token"]

        # 2. Verify genuine token
        verify_resp = await client.get(f"/api/v1/tables/7/verify-qr?token={genuine_token}")
        assert verify_resp.status_code == 200
        assert verify_resp.json()["is_valid"] is True

        # 3. Verify forged/tampered token is rejected
        fake_resp = await client.get("/api/v1/tables/7/verify-qr?token=forged_token_12345")
        assert fake_resp.status_code == 200
        assert fake_resp.json()["is_valid"] is False

        # 4. Fallback without token (unvalidated ?table=7)
        fallback_resp = await client.get("/api/v1/tables/7/verify-qr")
        assert fallback_resp.status_code == 200
        assert fallback_resp.json()["is_valid"] is False

@pytest.mark.asyncio
async def test_payment_order_creation_and_cryptographic_verification():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create an order first
        items_resp = await client.get("/api/v1/menu/items?is_available=true")
        item = items_resp.json()[0]

        order_resp = await client.post("/api/v1/orders", json={
            "table_id": 7,
            "order_type": "DINE_IN",
            "items": [{"menu_item_id": item["id"], "quantity": 1}],
        })
        assert order_resp.status_code == 201
        order = order_resp.json()
        order_id = order["id"]

        # 1. Create payment order via backend
        pay_order_resp = await client.post("/api/v1/payments/create", json={
            "order_id": order_id,
            "payment_method": "UPI",
        })
        assert pay_order_resp.status_code == 201
        pay_order = pay_order_resp.json()
        assert pay_order["is_test_mode"] is True
        assert "gateway_order_id" in pay_order

        # 2. Forged signature attempt must fail
        bad_verify = await client.post("/api/v1/payments/verify", json={
            "payment_id": pay_order["payment_id"],
            "gateway_order_id": pay_order["gateway_order_id"],
            "gateway_payment_id": "pay_fake_999",
            "signature": "invalid_forged_signature",
        })
        assert bad_verify.status_code == 400

        # 3. Legitimate gateway HMAC signature succeeds
        valid_payment_id = "pay_test_txn_777888"
        valid_signature = gateway_service.generate_test_signature(
            gateway_order_id=pay_order["gateway_order_id"],
            gateway_payment_id=valid_payment_id,
        )

        good_verify = await client.post("/api/v1/payments/verify", json={
            "payment_id": pay_order["payment_id"],
            "gateway_order_id": pay_order["gateway_order_id"],
            "gateway_payment_id": valid_payment_id,
            "signature": valid_signature,
        })
        assert good_verify.status_code == 200
        receipt = good_verify.json()
        assert receipt["payment_status"] == "SUCCESS"
        assert receipt["is_verified"] is True
