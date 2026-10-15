import asyncio
import os
import sys
import hashlib
import bcrypt
from sqlalchemy import select, func

# Ensure backend directory is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.abspath(os.path.join(current_dir, ".."))
project_root = os.path.abspath(os.path.join(backend_dir, ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models import (
    Restaurant,
    StaffUser,
    RestaurantTable,
    TableSection,
    MenuCategory,
    MenuItem,
    ProcessedWebhookEvent,
)

EXPECTED_HASHES = {
    "index.html": "217CE87139CD7DCFFDE8ED250E5CEB32186D7654CEF238325B3D8BBF83C54847",
    "app.js": "730A9F3558FB074A6150A90E47BD240189C6F5BAE973780F051898C96F8AB0C1",
    "design.css": "A2DBD33B23AF767E06A236AFE1066FE9300B87D83C2C01BAF7289CF9E053290C",
}

def compute_sha256(filepath: str) -> str:
    sha = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(8192):
            sha.update(chunk)
    return sha.hexdigest().upper()

async def run_full_verification():
    print("=" * 70)
    print("PHASE 1 DATABASE & INTEGRITY VERIFICATION SUITE")
    print("=" * 70)

    # 1. Verify Original Prototype File Hashes
    print("\n--- 1. PROTOTYPE INTEGRITY AUDIT ---")
    all_hashes_matched = True
    for filename, expected_hash in EXPECTED_HASHES.items():
        root_path = os.path.join(project_root, filename)
        backup_path = os.path.join(project_root, "backup_prototype", filename)

        if not os.path.exists(root_path):
            print(f"[FAIL] Root file missing: {filename}")
            all_hashes_matched = False
            continue

        if not os.path.exists(backup_path):
            print(f"[FAIL] Backup file missing: {filename}")
            all_hashes_matched = False
            continue

        root_hash = compute_sha256(root_path)
        backup_hash = compute_sha256(backup_path)

        if root_hash == expected_hash and backup_hash == expected_hash:
            print(f"[PASS] {filename}: Hash verified: {root_hash[:16]}... (Matches Baseline & Backup)")
        else:
            print(f"[FAIL] {filename}: Hash mismatch! Root: {root_hash}, Expected: {expected_hash}")
            all_hashes_matched = False

    # 2. Database Model & Relationship Verification
    print("\n--- 2. DATABASE ENTITY & QUERY VERIFICATION ---")
    async with AsyncSessionLocal() as session:
        # Check Restaurant
        res_restaurants = await session.execute(select(Restaurant))
        restaurants = res_restaurants.scalars().all()
        print(f"[PASS] Restaurants Query: Found {len(restaurants)} restaurant(s)")
        assert len(restaurants) == 1, "Expected exactly 1 restaurant seeded"
        rest = restaurants[0]

        # Check Tables & Sections
        res_tables = await session.execute(
            select(RestaurantTable).where(RestaurantTable.restaurant_id == rest.id).order_by(RestaurantTable.table_number)
        )
        tables = res_tables.scalars().all()
        indoor_count = sum(1 for t in tables if t.section == TableSection.INDOOR)
        outdoor_count = sum(1 for t in tables if t.section == TableSection.OUTDOOR)
        print(f"[PASS] Tables Query: Found {len(tables)} tables (Indoor: {indoor_count}, Outdoor: {outdoor_count})")
        assert len(tables) == 23, "Expected 23 tables matching prototype"
        assert indoor_count == 18, "Expected 18 indoor tables (1-18)"
        assert outdoor_count == 5, "Expected 5 outdoor tables (19-23)"

        # Check Staff Users
        res_staff = await session.execute(
            select(StaffUser).where(StaffUser.restaurant_id == rest.id).order_by(StaffUser.name)
        )
        staff = res_staff.scalars().all()
        staff_names = [s.name for s in staff]
        print(f"[PASS] Staff Query: Found {len(staff)} staff members: {', '.join(staff_names)}")
        assert len(staff) == 6, "Expected 1 Manager + 5 Waiters"

        # Check Password Verification on Seeded Waiter "Rahul"
        rahul = next(s for s in staff if s.name == "Rahul")
        pw_valid = bcrypt.checkpw(settings.DEV_DEFAULT_PASSWORD.encode("utf-8"), rahul.password_hash.encode("utf-8"))
        print(f"[PASS] Password Hashing Validation: Rahul password matches DEV_DEFAULT_PASSWORD ({pw_valid})")
        assert pw_valid, "Bcrypt password check failed"
        assert rahul.must_change_password is True, "must_change_password flag should be True"

        # Check Menu & Categories
        res_cats = await session.execute(select(MenuCategory).where(MenuCategory.restaurant_id == rest.id))
        cats = res_cats.scalars().all()
        res_items = await session.execute(select(MenuItem))
        items = res_items.scalars().all()
        print(f"[PASS] Menu Query: Found {len(cats)} categories and {len(items)} menu items")
        assert len(cats) == 2, "Expected 2 categories"
        assert len(items) == 9, "Expected 9 menu items matching prototype"

        # Check ProcessedWebhookEvent table existence
        res_webhook = await session.execute(select(func.count(ProcessedWebhookEvent.id)))
        webhook_count = res_webhook.scalar_one()
        print(f"[PASS] Webhook Idempotency Table: Query successful, count: {webhook_count}")

        # Step 2.1: Verify Unique Constraint on (restaurant_id, table_number)
        print("\n--- 3. STEP 2.1 SCHEMA OPTIMIZATION VERIFICATION ---")
        dup_table_failed = False
        try:
            from sqlalchemy import text
            await session.execute(text(
                f"INSERT INTO restaurant_tables (restaurant_id, table_number, section, qr_seed, is_active) "
                f"VALUES ('{rest.id}', 7, 'INDOOR', 'duplicate_seed_7', 1)"
            ))
            await session.commit()
        except Exception as e:
            dup_table_failed = True
            await session.rollback()
            print(f"[PASS] Unique Constraint 'uq_restaurant_table_number': Duplicate table 7 insertion blocked ({type(e).__name__})")
        
        assert dup_table_failed, "Unique constraint failed to block duplicate table insertion!"

        # Step 2.1: Verify SQLite / PostgreSQL Indexes
        from sqlalchemy import text
        res_idx_sr = await session.execute(text("PRAGMA index_list('service_requests')"))
        sr_indexes = [row[1] for row in res_idx_sr.fetchall()]
        print(f"[PASS] service_requests indexes: {sr_indexes}")
        assert "ix_service_requests_table_status" in sr_indexes, "Missing index ix_service_requests_table_status"

        res_idx_sra = await session.execute(text("PRAGMA index_list('service_request_attempts')"))
        sra_indexes = [row[1] for row in res_idx_sra.fetchall()]
        print(f"[PASS] service_request_attempts indexes: {sra_indexes}")
        assert "ix_service_request_attempts_waiter_status_expires" in sra_indexes, "Missing index ix_service_request_attempts_waiter_status_expires"

    print("\n" + "=" * 70)
    if all_hashes_matched:
        print("PHASE 1 ALL VERIFICATIONS PASSED WITH ZERO REGRESSIONS!")
    else:
        print("PHASE 1 VERIFICATION FAILED INTEGRITY CHECKS!")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(run_full_verification())
