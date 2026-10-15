"""Order calculation and kitchen service logic."""
from decimal import Decimal

TAX_RATE = Decimal("0.05")  # 5% GST

def calculate_order_totals(subtotal: Decimal) -> dict:
    tax = (subtotal * TAX_RATE).quantize(Decimal("0.01"))
    total = subtotal + tax
    return {
        "subtotal": subtotal,
        "tax_amount": tax,
        "delivery_fee": Decimal("0.00"),
        "total_amount": total,
    }
