# Restaurant Smart Table Service & Waiter Routing System

**Grand Bistro & Cafe — Professional Multi-Layer Architecture**

A high-performance, modular restaurant service platform orchestrating real-time customer dining requests, smart fair-share waiter routing, order processing, and operations management.

---

## 1. System Architecture Overview

The codebase is strictly separated into three independent layers and supporting operational scripts:

```text
hotel-waiter/
│
├── FE/                                  # Frontend Application Layer
│   ├── index.html                       # Unified SPA portal entry point
│   ├── assets/
│   │   ├── css/
│   │   │   ├── main.css                 # Design tokens, variables, typography, reset, header, navigation
│   │   │   ├── customer.css             # Customer menu, cart drawer, service actions, table context
│   │   │   ├── waiter.css               # Waiter dashboard, task countdown, accept/reject feedback
│   │   │   └── manager.css              # 23-table live floor map, waiter roster, alert log
│   │   ├── js/
│   │   │   ├── main.js                  # Application orchestrator and client router
│   │   │   ├── api.js                   # Shared HTTP client (apiFetch, ApiError, CONFIG)
│   │   │   ├── auth.js                  # Session & token manager (sessionStorage only)
│   │   │   ├── customer.js              # Customer dining & service request controller
│   │   │   ├── waiter.js                # Waiter workstation controller
│   │   │   ├── manager.js               # Manager operations control room controller
│   │   │   └── components.js            # Reusable UI components (Modal, Toast, Chime, Store, i18n)
│   │   └── images/
│   │       └── logo.svg                 # Brand vector logo
│   ├── pages/
│   │   ├── customer/index.html          # Deep-link customer QR dining entry
│   │   ├── waiter/index.html            # Waiter workstation portal
│   │   ├── manager/index.html           # Manager console portal
│   │   └── auth/index.html              # Staff login portal
│   └── README.md                        # Frontend documentation
│
├── BE/                                  # Backend Application Layer
│   ├── app/
│   │   ├── main.py                      # FastAPI application entry point & middleware
│   │   ├── api/
│   │   │   ├── router.py                # Consolidated v1 API router
│   │   │   ├── auth.py                  # Authentication & JWT endpoints
│   │   │   ├── customers.py             # Customer & table service endpoints
│   │   │   ├── waiters.py               # Waiter task management & status endpoints
│   │   │   ├── managers.py              # Manager console, alerts, & rerouting endpoints
│   │   │   ├── service_requests.py      # Table dispatch & lifecycle endpoints
│   │   │   ├── menu.py                  # Digital menu items & categories
│   │   │   ├── orders.py                # Order placement & fulfillment
│   │   │   ├── bills.py                 # Billing calculations & checkout
│   │   │   ├── qr.py                    # Table QR token validation
│   │   │   └── common.py                # Shared dependencies and database session
│   │   ├── core/
│   │   │   ├── config.py                # Environment configuration & pydantic settings
│   │   │   ├── security.py              # Password hashing & JWT token verification
│   │   │   ├── dependencies.py          # FastApi security & database dependencies
│   │   │   └── logging.py               # Structured application logger
│   │   ├── schemas/                     # Pydantic request & response models
│   │   ├── services/
│   │   │   ├── routing_service.py       # Deterministic waiter-routing engine
│   │   │   ├── request_service.py       # Service request dispatch manager
│   │   │   ├── waiter_service.py        # Waiter duty and assignment manager
│   │   │   ├── order_service.py         # Order calculations & sequence manager
│   │   │   └── billing_service.py       # Bill generation & payment tracking
│   │   └── tests/                       # 7 backend regression & unit test suites (59 tests)
│   ├── requirements.txt                 # Backend Python package requirements
│   ├── .env.example                     # Backend environment template
│   └── README.md                        # Backend architectural guide
│
├── DB/                                  # Database Layer
│   ├── connection.py                    # AsyncEngine, Base declarative, custom GUID & JSON types
│   ├── session.py                       # AsyncSessionLocal, session contexts, connectivity checks
│   ├── seed.py                          # Safe seeding script (Restaurant, 23 tables, Staff, Menu)
│   ├── models/                          # Domain-separated SQLAlchemy declarative models
│   ├── migrations/                      # Alembic migrations history and versions
│   ├── hotel_waiter.db                  # Authoritative SQLite database file (preserved)
│   ├── hotel_waiter.db.bak              # Authoritative database backup (preserved)
│   ├── schema_documentation.md          # Complete entity relational schema documentation
│   └── README.md                        # Database operational guide
│
├── scripts/                             # Operational & Diagnostic Automation
│   ├── start_backend.py                 # Backend runner with uvicorn
│   ├── check_database.py                # Non-destructive database & business data verification
│   └── run_tests.py                     # Pytest regression suite runner
│
├── .env.example                         # Root environment template
├── .gitignore                           # Git exclusion rules
├── README.md                            # Primary documentation (this file)
└── start.py                             # Documented root main entry point
```

---

## 2. Quick Start Commands (Windows PowerShell)

The root `start.py` serves as the authoritative entry point for all operations.

### Interactive Menu
To launch the interactive control console:
```powershell
python start.py
```
```text
========================================================================
Restaurant Smart Table Service & Waiter Routing System — Grand Bistro
========================================================================
1. Start Backend Server (FastAPI on http://127.0.0.1:8000)
2. Check Database Connectivity & Schema Health
3. Run Backend Regression Test Suite
4. Start Frontend Dev Server (http://127.0.0.1:3000)
5. Run Safe Database Seeding (DB/seed.py)
0. Exit
========================================================================
```

### Direct CLI Commands

#### 1. Check Database Health
Verifies database connectivity, tables existence, 23 tables (18 indoor, 5 outdoor), active staff, and historical records:
```powershell
python start.py --check-db
# or
python scripts/check_database.py
```

#### 2. Run Backend Regression Tests
Executes the full test suite (59 tests across 7 test suites):
```powershell
python start.py --test
# or
python scripts/run_tests.py
```

#### 3. Start the Backend API Server
Runs FastAPI on `http://127.0.0.1:8000` with auto-reload:
```powershell
python start.py --backend
# or
python scripts/start_backend.py
```
- Interactive Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc Documentation: `http://127.0.0.1:8000/redoc`
- API Health Status: `http://127.0.0.1:8000/api/v1/health`

#### 4. Serve the Frontend Web Application
Runs a local web server serving the `FE/` application on `http://127.0.0.1:3000`:
```powershell
python start.py --frontend
# or
python -m http.server 3000 --directory FE
```
- Customer Table 7 Dining: `http://127.0.0.1:3000/#/customer?table=7`
- Waiter Workstation: `http://127.0.0.1:3000/#/waiter/dashboard`
- Manager Operations: `http://127.0.0.1:3000/#/manager/dashboard`
- Staff Login: `http://127.0.0.1:3000/#/auth`

---

## 3. Preserved Core Business Logic

The deterministic routing engine and restaurant operations adhere strictly to all business requirements:

1. **Restaurant Floor Plan**:
   - Total 23 tables: 18 Indoor tables (1–18) and 5 Outdoor garden tables (19–23).
2. **Staff Roster**:
   - 5 Waiters: Rahul Sharma, Aman Verma, Vikas Patel, Suresh Kumar, Mohit Singh.
   - 1 Manager: Vikram Mehta.
3. **Dispatch & Routing Algorithm**:
   - **Primary Waiter Memory**: Tables remember their assigned primary waiter for customer continuity.
   - **Fair-Share Load Balancing**: Active service requests are distributed evenly among available waiters.
   - **Longest-Idle Selection**: Ties are broken in favor of the waiter who has waited longest since their last completed assignment.
   - **Attempt Deadlines**: 1st attempt: 45 seconds; subsequent attempts: 30 seconds; maximum 3 total attempts.
   - **Immediate Rejection Rerouting**: If a waiter rejects a request, it is rerouted immediately to the next optimal candidate without waiting for timeout.
   - **Safeguards**: Offline waiter safeguards, overload protections, duplicate request suppression (60-second window), and 10-minute auto-closure of completed requests.

---

## 4. Security & Data Protection Guarantees

- **No Data Loss**: The authoritative SQLite database `DB/hotel_waiter.db` and backup `DB/hotel_waiter.db.bak` have been preserved 100% intact with zero destructive alterations.
- **Token Security**: Staff JWT authentication tokens are strictly stored in browser `sessionStorage` (tab-scoped and cleared on browser closure) to eliminate persistent XSS attack vectors. Tokens are never written to `localStorage`.
- **Credential Protection**: Passwords use bcrypt/Argon2 hashing; environment variables are isolated into `.env` and excluded via `.gitignore`.

---

## 5. Verification & Test Suite Status

```text
============================= test session starts =============================
platform win32 -- Python 3.14.0, pytest-8.4.2
collected 59 items

BE/tests/test_auth_menu_orders.py ........                               [ 13%]
BE/tests/test_payments_qr.py ..                                          [ 16%]
BE/tests/test_phase0_endpoints.py .....                                  [ 25%]
BE/tests/test_routing_engine.py ...................                      [ 57%]
BE/tests/test_step2_2.py ...................                             [ 89%]
BE/tests/test_step2_4_api.py .......                                     [100%]
BE/tests/test_step2_4_manager_alerts.py .                                [100%]

====================== 59 passed in 9.56s =======================
```
**Status: 100% PASS (59 passed, 0 failed)**
