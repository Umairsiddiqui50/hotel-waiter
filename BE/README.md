# Backend Layer (BE)

FastAPI application layer containing versioned HTTP endpoints, authentication, business services, and testing suites.

## Architecture
- `app/main.py`: ASGI application entry point with lifespan, CORS, and static file mounts.
- `app/api/`: Versioned API routers (`auth.py`, `service_requests.py`, `waiters.py`, `managers.py`, `menu.py`, `orders.py`, `payments.py`, `qr.py`, `customers.py`).
- `app/core/`: Configuration, bcrypt security, role guards, structured logging.
- `app/schemas/`: Pydantic input validation and response schemas.
- `app/services/`: Locked waiter-routing engine, request service, billing service, order calculation.
- `tests/`: Pytest integration and regression test suites.

## Running Tests
```powershell
python scripts/run_tests.py
```
