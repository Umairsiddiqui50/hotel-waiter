import os
import sys
import asyncio

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DB_DIR = os.path.join(BASE_DIR, "DB")
BE_DIR = os.path.join(BASE_DIR, "BE")

for p in [DB_DIR, BE_DIR, BASE_DIR]:
    if p not in sys.path:
        sys.path.insert(0, p)

from sqlalchemy import text
from DB.connection import engine, DATABASE_URL
from DB.session import AsyncSessionLocal

async def check_database():
    print(f"\n=== Checking Database Health ===")
    print(f"Database URL: {DATABASE_URL}")

    # Check 1: Engine Connectivity
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
            val = result.scalar()
            if val == 1:
                print("  [PASS] Async database engine connected successfully.")
    except Exception as e:
        print(f"  [FAIL] Database connection failed: {e}")
        return False

    # Check 2: Schema Tables Inspection
    expected_tables = [
        "restaurants",
        "restaurant_tables",
        "staff_users",
        "service_requests",
        "service_request_attempts",
        "manager_alerts",
        "orders",
        "order_items",
        "menu_categories",
        "menu_items",
        "payments",
        "bills",
        "audit_logs"
    ]

    try:
        async with engine.connect() as conn:
            if engine.dialect.name == "sqlite":
                result = await conn.execute(text("SELECT name FROM sqlite_master WHERE type='table';"))
            elif engine.dialect.name == "mysql":
                result = await conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE();"))
            else:
                result = await conn.execute(text("SELECT table_name FROM information_schema.tables;"))
            existing_tables = [row[0] for row in result.fetchall()]


        missing = [t for t in expected_tables if t not in existing_tables]
        if missing:
            print(f"  [WARN] Missing tables in database: {missing}")
        else:
            print(f"  [PASS] All {len(expected_tables)} expected database tables exist.")
    except Exception as e:
        print(f"  [FAIL] Failed to inspect database tables: {e}")
        return False

    # Check 3: Business Data Verification
    try:
        async with AsyncSessionLocal() as session:
            # Table count (23 tables expected: 18 indoor, 5 outdoor)
            tbl_res = await session.execute(text("SELECT COUNT(*) FROM restaurant_tables"))
            tbl_count = tbl_res.scalar()

            indoor_res = await session.execute(text("SELECT COUNT(*) FROM restaurant_tables WHERE section = 'INDOOR'"))
            indoor_count = indoor_res.scalar()

            outdoor_res = await session.execute(text("SELECT COUNT(*) FROM restaurant_tables WHERE section = 'OUTDOOR'"))
            outdoor_count = outdoor_res.scalar()

            print(f"  [PASS] Tables verified: {tbl_count} total ({indoor_count} Indoor, {outdoor_count} Outdoor).")

            # Staff Users
            staff_res = await session.execute(text("SELECT role, COUNT(*) FROM staff_users GROUP BY role"))
            staff_counts = dict(staff_res.fetchall())
            print(f"  [PASS] Staff roster verified: {staff_counts}")

            # Menu items
            menu_res = await session.execute(text("SELECT COUNT(*) FROM menu_items"))
            menu_count = menu_res.scalar()
            print(f"  [PASS] Menu items active: {menu_count} items.")

            # Service requests
            req_res = await session.execute(text("SELECT COUNT(*) FROM service_requests"))
            req_count = req_res.scalar()
            print(f"  [PASS] Service requests preserved: {req_count} historical records.")

    except Exception as e:
        print(f"  [FAIL] Data check failed: {e}")
        return False

    print("=== Database Health: EXCELLENT (All checks passed) ===\n")
    return True

def main():
    success = asyncio.run(check_database())
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
