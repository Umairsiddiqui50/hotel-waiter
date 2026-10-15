import asyncio
import os
import sys
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./hotel_waiter.db")

async def check_target_database():
    print("=" * 60)
    print("DATABASE SAFETY INSPECTION PROTOCOL")
    print("=" * 60)
    print(f"Target Database URL: {DATABASE_URL}")
    
    # Check if target is SQLite or PostgreSQL
    is_sqlite = "sqlite" in DATABASE_URL
    is_postgres = "postgres" in DATABASE_URL or "asyncpg" in DATABASE_URL
    
    try:
        engine = create_async_engine(DATABASE_URL, echo=False)
        async with engine.connect() as conn:
            if is_postgres:
                result = await conn.execute(text(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
                ))
                tables = [row[0] for row in result.fetchall()]
            elif is_sqlite:
                result = await conn.execute(text(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
                ))
                tables = [row[0] for row in result.fetchall()]
            else:
                tables = []
                
        await engine.dispose()
        
        print(f"Total existing tables found in target database: {len(tables)}")
        if tables:
            print(f"WARNING: The target database already contains {len(tables)} tables:")
            for t in tables:
                print(f"  - {t}")
            print("\nSAFETY PROTOCOL: Existing tables detected!")
            return {"safe": False, "tables": tables, "url": DATABASE_URL}
        else:
            print("CLEAN DATABASE: Zero existing tables found. Target database is clean and safe for initial migration.")
            return {"safe": True, "tables": [], "url": DATABASE_URL}
            
    except Exception as e:
        print(f"Inspection notice / connection status: {e}")
        # If SQLite file doesn't exist yet, it's completely clean
        if is_sqlite and not os.path.exists("./hotel_waiter.db"):
            print("CLEAN DATABASE: SQLite database file does not exist yet. Safe to proceed.")
            return {"safe": True, "tables": [], "url": DATABASE_URL}
        return {"safe": False, "error": str(e), "url": DATABASE_URL}

if __name__ == "__main__":
    res = asyncio.run(check_target_database())
    if not res.get("safe"):
        sys.exit(1)
    else:
        sys.exit(0)
