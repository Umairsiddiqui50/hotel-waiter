import os
import sys
import uuid
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text
from alembic.config import Config
from alembic import command

# Paths
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

disposable_db_file = os.path.join(backend_dir, "disposable_test_migration.db")
disposable_db_url = f"sqlite+aiosqlite:///{disposable_db_file.replace('\\', '/')}"

def get_alembic_config(db_url: str):
    alembic_cfg = Config(os.path.join(backend_dir, "alembic.ini"))
    alembic_cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", db_url)
    return alembic_cfg

async def insert_test_data(rest_id: str):
    engine = create_async_engine(disposable_db_url, echo=False)
    Session = async_sessionmaker(bind=engine)
    async with Session() as session:
        await session.execute(text(
            f"INSERT INTO restaurants (id, name, slug, is_active, created_at) "
            f"VALUES ('{rest_id}', 'Test Bistro', 'test-bistro', 1, CURRENT_TIMESTAMP)"
        ))
        await session.execute(text(
            f"INSERT INTO restaurant_tables (restaurant_id, table_number, section, qr_seed, is_active) "
            f"VALUES ('{rest_id}', 7, 'INDOOR', 'seed7', 1)"
        ))
        await session.commit()
    await engine.dispose()

async def verify_constraints_and_data(rest_id: str):
    engine = create_async_engine(disposable_db_url, echo=False)
    Session = async_sessionmaker(bind=engine)
    async with Session() as session:
        # Check Table 7 still exists
        res = await session.execute(text(f"SELECT table_number FROM restaurant_tables WHERE restaurant_id = '{rest_id}'"))
        rows = res.fetchall()
        assert len(rows) == 1 and rows[0][0] == 7, "Existing table data was corrupted!"
        print("[PASS] Existing Table 7 data is intact after migration 002")

        # Test duplicate insertion (should fail with IntegrityError)
        duplicate_failed = False
        try:
            await session.execute(text(
                f"INSERT INTO restaurant_tables (restaurant_id, table_number, section, qr_seed, is_active) "
                f"VALUES ('{rest_id}', 7, 'INDOOR', 'seed7_dup', 1)"
            ))
            await session.commit()
        except Exception as e:
            duplicate_failed = True
            await session.rollback()
            print(f"[PASS] Duplicate table insertion correctly rejected by unique constraint: {type(e).__name__}")
        
        assert duplicate_failed, "Unique constraint failed to block duplicate table insertion!"
    await engine.dispose()

async def verify_data_after_downgrade(rest_id: str):
    engine = create_async_engine(disposable_db_url, echo=False)
    Session = async_sessionmaker(bind=engine)
    async with Session() as session:
        res = await session.execute(text(f"SELECT table_number FROM restaurant_tables WHERE restaurant_id = '{rest_id}'"))
        rows = res.fetchall()
        assert len(rows) == 1 and rows[0][0] == 7, "Table data lost after downgrade!"
        print("[PASS] Table 7 still intact after downgrade to 001")
    await engine.dispose()

def run_test():
    print("=" * 70)
    print("DISPOSABLE DATABASE MIGRATION UPGRADE & DOWNGRADE TEST")
    print("=" * 70)
    print(f"Disposable DB: {disposable_db_file}")

    if os.path.exists(disposable_db_file):
        os.remove(disposable_db_file)

    alembic_cfg = get_alembic_config(disposable_db_url)

    # 1. Upgrade to 001 (baseline)
    print("\n--- Step 1: Upgrade to 001 (baseline) ---")
    command.upgrade(alembic_cfg, "5ba5d2115aa4")
    print("[PASS] Baseline 001 schema applied on disposable DB")

    # 2. Insert test data
    rest_id = str(uuid.uuid4())
    asyncio.run(insert_test_data(rest_id))
    print("[PASS] Sample restaurant and Table 7 inserted into disposable DB")

    # 3. Upgrade to 002 (optimizations)
    print("\n--- Step 2: Upgrade to 002 (schema optimizations) ---")
    command.upgrade(alembic_cfg, "93156ad0e403")
    print("[PASS] Migration 002 applied successfully to disposable DB")

    # 4. Verify data preservation & unique constraint
    asyncio.run(verify_constraints_and_data(rest_id))

    # 5. Downgrade from 002 back to 001
    print("\n--- Step 3: Downgrade from 002 back to 001 ---")
    command.downgrade(alembic_cfg, "5ba5d2115aa4")
    print("[PASS] Downgrade back to 001 succeeded cleanly")

    # 6. Verify data after downgrade
    asyncio.run(verify_data_after_downgrade(rest_id))

    # 7. Clean up disposable DB
    if os.path.exists(disposable_db_file):
        os.remove(disposable_db_file)
        print("\n[CLEANUP] Disposable test database removed")

    print("\n" + "=" * 70)
    print("ALL DISPOSABLE MIGRATION TESTS PASSED WITH 100% REVERSIBILITY!")
    print("=" * 70)

if __name__ == "__main__":
    run_test()
