import asyncio
import os
import sys
import pymysql

BASE_DIR = r"c:\Users\ASUS\OneDrive\Documents\Desktop\hotel_waiter"
sys.path.insert(0, BASE_DIR)
sys.path.insert(0, os.path.join(BASE_DIR, "BE"))

MYSQL_USER = "root"
MYSQL_PASS = "8094271418"
MYSQL_HOST = "127.0.0.1"
MYSQL_PORT = 3306
DB_NAME = "hotel_waiter_db"

def create_mysql_database():
    print(f"Connecting to MySQL at {MYSQL_HOST}:{MYSQL_PORT} with user '{MYSQL_USER}'...")
    conn = pymysql.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASS,
        autocommit=True
    )
    with conn.cursor() as cur:
        cur.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
        print(f"Database '{DB_NAME}' created / verified successfully in MySQL!")
    conn.close()

async def migrate_schema_and_data():
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from sqlalchemy import select
    from DB.connection import Base
    import DB.models  # load all models

    sqlite_url = f"sqlite+aiosqlite:///{os.path.join(BASE_DIR, 'DB', 'hotel_waiter.db').replace(chr(92), '/')}"
    mysql_url = f"mysql+aiomysql://{MYSQL_USER}:{MYSQL_PASS}@{MYSQL_HOST}:{MYSQL_PORT}/{DB_NAME}"

    sqlite_engine = create_async_engine(sqlite_url, echo=False)
    mysql_engine = create_async_engine(mysql_url, echo=False)

    print("Creating all tables in MySQL database...")
    async with mysql_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("All SQLAlchemy tables created in MySQL successfully!")

    # Now migrate data from SQLite to MySQL
    SqliteSession = async_sessionmaker(bind=sqlite_engine, class_=AsyncSession, expire_on_commit=False)
    MysqlSession = async_sessionmaker(bind=mysql_engine, class_=AsyncSession, expire_on_commit=False)

    from DB.models.restaurant import Restaurant
    from DB.models.table import RestaurantTable, DiningSession
    from DB.models.staff_user import StaffUser
    from DB.models.menu import MenuCategory, MenuItem
    from DB.models.order import Order, OrderItem
    from DB.models.payment import Payment
    from DB.models.service_request import ServiceRequest, ServiceRequestAttempt, ManagerAlert

    model_order = [
        Restaurant,
        RestaurantTable,
        StaffUser,
        DiningSession,
        MenuCategory,
        MenuItem,
        Order,
        OrderItem,
        Payment,
        ServiceRequest,
        ServiceRequestAttempt,
        ManagerAlert,
    ]

    async with SqliteSession() as src_db, MysqlSession() as dst_db:
        for model in model_order:
            records = (await src_db.execute(select(model))).scalars().all()
            print(f"Migrating {len(records)} records for {model.__tablename__}...")
            for r in records:
                # Merge into MySQL session
                await dst_db.merge(r)
            await dst_db.commit()

    await sqlite_engine.dispose()
    await mysql_engine.dispose()
    print(f"=== MIGRATION COMPLETE: All tables and data are now in MySQL '{DB_NAME}'! ===")

def main():
    create_mysql_database()
    asyncio.run(migrate_schema_and_data())

if __name__ == "__main__":
    main()
