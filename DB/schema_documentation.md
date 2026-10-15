# Database Architecture & Schema Documentation

## 1. Overview
The database layer manages persistent state for the Smart Table Service platform, supporting multi-restaurant tenancy, authoritative waiter dispatching, customer dining sessions, digital menu ordering, payment auditing, and staff rosters.

- **Current Engine:** SQLite with `aiosqlite` (production-ready for PostgreSQL with `asyncpg`).
- **Connection Management:** `DB.connection` provides `AsyncEngine` with connection pooling and custom cross-database types (`GUID`, `CompatibleJSON`).
- **Session Lifecycle:** `DB.session` provides `AsyncSessionLocal` sessionmaker and FastAPI dependency `get_db()`.
- **Migrations:** Alembic versioned migrations tracked under `DB/migrations/versions/`.

---

## 2. Entity Relational Architecture

### Table Roster & Sessions
1. **`restaurants`**: Root tenant model (`id`, `name`, `slug`, `is_active`, `created_at`).
2. **`restaurant_tables`**:
   - `id`: Integer Primary Key.
   - `restaurant_id`: Foreign Key (`restaurants.id`, CASCADE).
   - `table_number`: Integer (1 to 23).
   - `section`: Enum (`INDOOR`, `OUTDOOR`). Indoor: 1-18, Outdoor: 19-23.
   - `qr_seed`: String(100), cryptographic seed for signed QR token generation.
   - `is_active`: Boolean.
   - **Constraint:** Unique(`restaurant_id`, `table_number`).
3. **`dining_sessions`**:
   - `id`: GUID Primary Key.
   - `table_id`: Foreign Key (`restaurant_tables.id`, CASCADE).
   - `session_token`: String(100) Unique Index.
   - `primary_waiter_id`: Foreign Key (`staff_users.id`, SET NULL) - table memory.
   - `status`: Enum (`ACTIVE`, `BILLED`, `CLOSED`).

### Staff & Operations
4. **`staff_users`**:
   - `id`: GUID Primary Key.
   - `restaurant_id`: Foreign Key (`restaurants.id`, CASCADE).
   - `name`: String(100).
   - `email`: String(150) Unique Index.
   - `phone`: String(20) Unique Index.
   - `password_hash`: String(255) bcrypt hash.
   - `role`: Enum (`WAITER`, `MANAGER`, `ADMIN`, `KITCHEN`).
   - `is_online`: Boolean (offline safeguard toggle).
   - `accepted_count`, `missed_count`, `rejected_count`, `streak`: Workload counters.
5. **`service_requests`**:
   - `id`: BigInteger/Integer Primary Key.
   - `session_id`: Foreign Key (`dining_sessions.id`, CASCADE).
   - `table_id`: Foreign Key (`restaurant_tables.id`, CASCADE).
   - `service_key`: String(50) (e.g. `water`, `bill`, `cutlery`, `call`, `custom`).
   - `details`: String(255).
   - `status`: Enum (`PENDING`, `ASSIGNED`, `ESCALATED`, `ACCEPTED`, `CLOSED`, `CANCELLED`, `FAILED`).
   - `accepted_by`: Foreign Key (`staff_users.id`, SET NULL).
   - `resend_count`: Integer (max 3 resends).
6. **`service_request_attempts`**:
   - `id`: BigInteger/Integer Primary Key.
   - `request_id`: Foreign Key (`service_requests.id`, CASCADE).
   - `waiter_id`: Foreign Key (`staff_users.id`, CASCADE).
   - `attempt_number`: Integer (1, 2, or 3).
   - `status`: Enum (`WAITING`, `ACCEPTED`, `REJECTED`, `MISSED`, `CANCELLED`).
   - `timeout_seconds`: 45s for 1st attempt, 30s for subsequent attempts.
   - `assigned_at`, `expires_at`, `responded_at`: Timestamps.
7. **`manager_alerts`**:
   - `id`: BigInteger/Integer Primary Key.
   - `request_id`: Foreign Key (`service_requests.id`, CASCADE).
   - `alert_type`: Enum (`NONE` = 0 online waiters, `ALL` = 3 failed attempts, `LIMIT` = resend limit).
   - `is_open`: Boolean.
   - `assigned_waiter_id`: Foreign Key (`staff_users.id`, SET NULL) - manual override assignment.

### Menu, Orders & Payments
8. **`menu_categories`**: `id`, `restaurant_id`, `name`, `sort_order`.
9. **`menu_items`**: `id`, `category_id`, `name`, `price`, `is_available`, `image_url`.
10. **`orders`**: `id`, `restaurant_id`, `table_id`, `session_id`, `order_type`, `status` (`CONFIRMED`, `PREPARING`, `READY`, `SERVED`), `subtotal`, `tax_amount`, `total_amount`, `special_instructions`.
11. **`order_items`**: `id`, `order_id`, `menu_item_id`, `item_name`, `unit_price`, `quantity`, `subtotal`.
12. **`payments`**: `id`, `order_id`, `amount`, `payment_method`, `payment_status` (`PENDING`, `SUCCESS`, `FAILED`), `gateway_name`, `gateway_transaction_id`, `gateway_signature`.
13. **`audit_logs`**: Immutable audit records for payments, manual assignments, and security actions.

---

## 3. Migration History
1. `5ba5d2115aa4_001_initial_schema.py`: Baseline tables, indexes, constraints, and relationships.
2. `93156ad0e403_002_schema_optimizations.py`: Indexes for composite lookup `ix_service_requests_table_status` and `ix_service_request_attempts_waiter_status_expires`.
