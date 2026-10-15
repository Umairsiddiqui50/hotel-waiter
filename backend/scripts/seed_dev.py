import asyncio
import os
import sys
import uuid
from decimal import Decimal
import bcrypt

# Ensure backend directory is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.abspath(os.path.join(current_dir, ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models import (
    Restaurant,
    StaffUser,
    StaffRole,
    RestaurantTable,
    TableSection,
    MenuCategory,
    MenuItem,
)

def hash_secret(secret: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(secret.encode("utf-8"), salt).decode("utf-8")

async def seed_development_data():
    print("=" * 60)
    print("DEVELOPMENT SEEDING SCRIPT")
    print("=" * 60)

    # 1. Environment Safety Check
    if settings.ENVIRONMENT.lower() == "production":
        raise RuntimeError("CRITICAL ERROR: Seeding is strictly forbidden in production!")

    print(f"Environment: {settings.ENVIRONMENT} (Safe to seed)")
    print(f"Dev Default Password: {settings.DEV_DEFAULT_PASSWORD}")

    dev_pw_hash = hash_secret(settings.DEV_DEFAULT_PASSWORD)
    dev_pin_hash = hash_secret("1234")

    async with AsyncSessionLocal() as session:
        # Check if restaurant already exists
        from sqlalchemy import select
        res = await session.execute(select(Restaurant).where(Restaurant.slug == "grand-bistro"))
        existing_restaurant = res.scalar_one_or_none()

        if existing_restaurant:
            print("Notice: Restaurant 'Grand Bistro' already seeded. Skipping to avoid duplicates.")
            return

        # 2. Seed Restaurant
        restaurant = Restaurant(
            id=uuid.uuid4(),
            name="Grand Bistro & Cafe",
            slug="grand-bistro",
            is_active=True,
        )
        session.add(restaurant)
        await session.flush()
        print(f"Seeded Restaurant: {restaurant.name} (ID: {restaurant.id})")

        # 3. Seed 23 Tables (1-18 Indoor, 19-23 Outdoor matching prototype)
        tables = []
        for i in range(1, 24):
            section = TableSection.INDOOR if i <= 18 else TableSection.OUTDOOR
            table = RestaurantTable(
                restaurant_id=restaurant.id,
                table_number=i,
                section=section,
                qr_seed=f"qr_seed_table_{i}_{uuid.uuid4().hex[:8]}",
                is_active=True,
            )
            tables.append(table)
            session.add(table)
        await session.flush()
        print(f"Seeded {len(tables)} Tables (1-18 Indoor, 19-23 Outdoor)")

        # 4. Seed Manager
        manager = StaffUser(
            restaurant_id=restaurant.id,
            name="Manager Vikram",
            email="manager.dev@restaurant.local",
            phone="9000000000",
            password_hash=dev_pw_hash,
            pin_hash=dev_pin_hash,
            role=StaffRole.MANAGER,
            is_online=True,
            push_enabled=True,
            must_change_password=True,
        )
        session.add(manager)

        # 5. Seed 5 Prototype Waiters matching app.js
        waiter_names = ["Rahul", "Aman", "Vikas", "Suresh", "Mohit"]
        waiters = []
        for idx, name in enumerate(waiter_names, start=1):
            waiter = StaffUser(
                restaurant_id=restaurant.id,
                name=name,
                email=f"{name.lower()}.dev@restaurant.local",
                phone=f"900000000{idx}",
                password_hash=dev_pw_hash,
                pin_hash=dev_pin_hash,
                role=StaffRole.WAITER,
                is_online=False,  # Waiters start offline by default per audit
                push_enabled=True,
                must_change_password=True,
            )
            waiters.append(waiter)
            session.add(waiter)
        await session.flush()
        print(f"Seeded Manager + {len(waiters)} Waiters ({', '.join(waiter_names)})")

        # 6. Seed Menu Categories
        cat_mains = MenuCategory(restaurant_id=restaurant.id, name="Main Course", sort_order=1)
        cat_beverages = MenuCategory(restaurant_id=restaurant.id, name="Beverages & Desserts", sort_order=2)
        session.add_all([cat_mains, cat_beverages])
        await session.flush()

        # 7. Seed 9 Prototype Menu Items matching app.js MENU array
        # [{n:"Veg Biryani",p:200,a:false},{n:"Tandoori Roti",p:20,a:true},{n:"Butter Naan",p:40,a:true},
        #  {n:"Steam Rice",p:100,a:true},{n:"Jeera Rice",p:130,a:true},{n:"Cold Drink",p:40,a:true},
        #  {n:"Sweet Lassi",p:70,a:true},{n:"Dal Tadka",p:180,a:true},{n:"Gulab Jamun",p:70,a:true}]
        menu_items_data = [
            ("Veg Biryani", Decimal("200.00"), False, cat_mains.id),
            ("Tandoori Roti", Decimal("20.00"), True, cat_mains.id),
            ("Butter Naan", Decimal("40.00"), True, cat_mains.id),
            ("Steam Rice", Decimal("100.00"), True, cat_mains.id),
            ("Jeera Rice", Decimal("130.00"), True, cat_mains.id),
            ("Dal Tadka", Decimal("180.00"), True, cat_mains.id),
            ("Cold Drink", Decimal("40.00"), True, cat_beverages.id),
            ("Sweet Lassi", Decimal("70.00"), True, cat_beverages.id),
            ("Gulab Jamun", Decimal("70.00"), True, cat_beverages.id),
        ]

        menu_items = []
        for name, price, is_avail, cat_id in menu_items_data:
            item = MenuItem(
                category_id=cat_id,
                name=name,
                price=price,
                is_available=is_avail,
            )
            menu_items.append(item)
            session.add(item)

        await session.commit()
        print(f"Seeded {len(menu_items)} Menu Items matching prototype.")
        print("DEVELOPMENT SEEDING COMPLETED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(seed_development_data())
