# Database Layer (DB)

This layer manages database models, connections, migrations, and database administration tools.

## Structure
- `connection.py`: SQLAlchemy `AsyncEngine`, custom cross-database `GUID` and `CompatibleJSON` types.
- `session.py`: `AsyncSessionLocal`, transactional `get_db()` dependency for FastAPI.
- `models/`: Declarative SQLAlchemy domain models (`table.py`, `staff_user.py`, `service_request.py`, `order.py`, `menu.py`, `payment.py`, `audit_log.py`).
- `migrations/`: Alembic environment and schema revision versions.
- `seed.py`: Seeding script populating 23 tables, 5 waiters, manager, and menu catalogue.
- `schema_documentation.md`: Comprehensive table schema, constraints, and relationships.

## Running Database Check
```powershell
python scripts/check_database.py
```
