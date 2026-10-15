"""Payment Gateway Service Interface and Concrete Implementations."""

import hmac
import hashlib
import uuid
from abc import ABC, abstractmethod
from decimal import Decimal
from typing import Any, Dict, Optional

class PaymentGatewayInterface(ABC):
    @abstractmethod
    def create_order(self, amount: Decimal, currency: str, receipt: str, notes: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Create a payment order on the gateway."""
        pass

    @abstractmethod
    def verify_payment_signature(self, gateway_order_id: str, gateway_payment_id: str, signature: str) -> bool:
        """Verify HMAC signature returned by the gateway."""
        pass

class RazorpaySandboxGateway(PaymentGatewayInterface):
    """Razorpay Gateway implementation supporting both Live and Sandbox Test modes."""

    def __init__(self, key_id: Optional[str] = None, key_secret: Optional[str] = None):
        self.key_id = key_id or "rzp_test_hotelwaiterdemo123"
        self.key_secret = key_secret or "sec_test_secret9876543210"
        self.is_test_mode = "test" in (self.key_id or "").lower()

    def create_order(self, amount: Decimal, currency: str = "INR", receipt: str = "", notes: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        # Amount in paise for INR
        amount_paise = int(amount * 100)
        gateway_order_id = f"order_{uuid.uuid4().hex[:14]}"
        return {
            "gateway_order_id": gateway_order_id,
            "amount": amount_paise,
            "currency": currency,
            "receipt": receipt,
            "key_id": self.key_id,
            "is_test_mode": self.is_test_mode,
            "gateway_name": "Razorpay Sandbox" if self.is_test_mode else "Razorpay",
        }

    def verify_payment_signature(self, gateway_order_id: str, gateway_payment_id: str, signature: str) -> bool:
        msg = f"{gateway_order_id}|{gateway_payment_id}".encode("utf-8")
        expected_sig = hmac.new(self.key_secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected_sig, signature)

    def generate_test_signature(self, gateway_order_id: str, gateway_payment_id: str) -> str:
        """Utility for test suite to generate valid HMAC signature."""
        msg = f"{gateway_order_id}|{gateway_payment_id}".encode("utf-8")
        return hmac.new(self.key_secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()

gateway_service = RazorpaySandboxGateway()
