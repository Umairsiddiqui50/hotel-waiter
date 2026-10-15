"""Database Seeding Script for Development & Client Demos."""

import asyncio
import os
import sys
import uuid
from decimal import Decimal
import bcrypt

# Ensure root directory is in sys.path
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from sqlalchemy import select
from DB.session import AsyncSessionLocal
from DB.models import (
    MenuCategory,
    MenuItem,
    Restaurant,
    RestaurantTable,
    StaffRole,
    StaffUser,
    TableSection,
)

DEV_DEFAULT_PASSWORD = os.getenv("DEV_DEFAULT_PASSWORD", "DevOnly_ChangeMe!123")

def hash_secret(secret: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(secret.encode("utf-8"), salt).decode("utf-8")

async def seed_database():
    print("=" * 60)
    print("SMART TABLE SERVICE - DATABASE SEEDING")
    print("=" * 60)

    pw_hash = hash_secret(DEV_DEFAULT_PASSWORD)
    pin_hash = hash_secret("1234")

    async with AsyncSessionLocal() as session:
        # Check if already seeded
        res = await session.execute(select(Restaurant).where(Restaurant.slug == "grand-bistro"))
        existing = res.scalar_one_or_none()
        if existing:
            print("[INFO] Restaurant 'Grand Bistro' already seeded. Skipping to preserve existing data.")
            return

        # 1. Restaurant Entity
        restaurant = Restaurant(
            id=uuid.uuid4(),
            name="Grand Bistro & Cafe",
            slug="grand-bistro",
            is_active=True,
        )
        session.add(restaurant)
        await session.flush()
        print(f"[+] Seeded Restaurant: {restaurant.name} (ID: {restaurant.id})")

        # 2. 23 Restaurant Tables (1-18 Indoor, 19-23 Outdoor)
        tables = []
        for i in range(1, 24):
            sec = TableSection.INDOOR if i <= 18 else TableSection.OUTDOOR
            t = RestaurantTable(
                restaurant_id=restaurant.id,
                table_number=i,
                section=sec,
                qr_seed=f"qr_seed_table_{i}_{uuid.uuid4().hex[:8]}",
                is_active=True,
            )
            tables.append(t)
            session.add(t)
        await session.flush()
        print(f"[+] Seeded 23 Tables (1-18 Indoor, 19-23 Outdoor)")

        # 3. Manager Vikram
        manager = StaffUser(
            restaurant_id=restaurant.id,
            name="Manager Vikram",
            email="manager.dev@restaurant.local",
            phone="9000000000",
            password_hash=pw_hash,
            pin_hash=pin_hash,
            role=StaffRole.MANAGER,
            is_online=True,
            push_enabled=True,
            must_change_password=False,
        )
        session.add(manager)

        # 4. 5 Waiters matching locked specification
        waiter_names = ["Rahul", "Aman", "Vikas", "Suresh", "Mohit"]
        for idx, name in enumerate(waiter_names, start=1):
            w = StaffUser(
                restaurant_id=restaurant.id,
                name=name,
                email=f"{name.lower()}.dev@restaurant.local",
                phone=f"900000000{idx}",
                password_hash=pw_hash,
                pin_hash=pin_hash,
                role=StaffRole.WAITER,
                is_online=False,
                push_enabled=True,
                must_change_password=False,
            )
            session.add(w)
        await session.flush()
        print(f"[+] Seeded Manager Vikram and 5 Waiters: {', '.join(waiter_names)}")

        # 5. Menu Categories & Items
        cat_mains = MenuCategory(restaurant_id=restaurant.id, name="Main Course", sort_order=1)
        cat_bevs = MenuCategory(restaurant_id=restaurant.id, name="Beverages & Desserts", sort_order=2)
        session.add_all([cat_mains, cat_bevs])
        await session.flush()

        items_data = [
            ("Veg Biryani", Decimal("200.00"), False, cat_mains.id),
            ("Tandoori Roti", Decimal("20.00"), True, cat_mains.id),
            ("Butter Naan", Decimal("40.00"), True, cat_mains.id),
            ("Steam Rice", Decimal("100.00"), True, cat_mains.id),
            ("Jeera Rice", Decimal("130.00"), True, cat_mains.id),
            ("Dal Tadka", Decimal("180.00"), True, cat_mains.id),
            ("Cold Drink", Decimal("40.00"), True, cat_bevs.id),
            ("Sweet Lassi", Decimal("70.00"), True, cat_bevs.id),
            ("Gulab Jamun", Decimal("70.00"), True, cat_bevs.id),
        ]
        for name, price, avail, cid in items_data:
            session.add(MenuItem(
                category_id=cid,
                name=name,
                price=price,
                is_available=avail,
            ))

        await session.commit()
        print(f"[+] Seeded {len(items_data)} Menu Items matching catalogue.")
        print("[SUCCESS] Database seeding completed successfully!")

if __name__ == "__main__":
    asyncio.run(seed_database())
