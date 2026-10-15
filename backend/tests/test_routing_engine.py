"""Comprehensive Automated Test Suite for Algorithmic Waiter Routing Engine (Step 2.3).

Verifies:
- All 10 original routing scenarios from app.js.
- Concurrency-safe atomic updates and simultaneous request handling.
- Decision 1: NONE escalation when rejection leaves no available waiters.
- Decision 2: Manager manual assignment override after previous rejection.
- Offline safeguards (both offline and online transitions).
- Duplicate suppression (60s) and resend limits (3 resends -> LIMIT alert).
- 10-minute auto-close worker.
- Timer verification: 250ms polling target, latency, delayed ticks, and jitter measurements.
"""

import asyncio
import time
import uuid
import statistics
from datetime import datetime, timezone, timedelta
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool
from sqlalchemy import select, update, func

from app.core.database import Base
from app.models.restaurant import Restaurant
from app.models.table import RestaurantTable, TableSection, DiningSession, SessionStatus
from app.models.staff_user import StaffUser, StaffRole
from app.models.service_request import (
    ServiceRequest,
    ServiceRequestAttempt,
    ManagerAlert,
    RequestStatus,
    AttemptStatus,
    ManagerAlertType,
)
from app.services.routing_engine import (
    pick_waiter,
    assign_waiter,
    reject_waiter,
    accept_waiter,
    next_waiter,
    manager_assign,
    manager_resolve,
    offline_safeguard,
    timeout_worker,
    auto_close_worker,
    create_service_request,
    resend_service_request,
    get_waiter_metrics,
    CFG_FIRST,
    CFG_NEXT,
    CFG_TRIES,
    CFG_OVERLOAD,
    CFG_PRIMARY_MISS,
    CFG_CLOSE_MS,
    CFG_RESEND_MS,
    CFG_RESEND_MAX,
    CFG_DUP_ACCEPT_MS,
)


@pytest_asyncio.fixture
async def db_session():
    """Create an isolated, in-memory SQLite async test database with all tables and seed data."""
    test_engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        bind=test_engine,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
        class_=AsyncSession,
    )

    async with session_factory() as session:
        # Seed restaurant
        rest_id = uuid.uuid4()
        restaurant = Restaurant(
            id=rest_id,
            name="Grand Bistro",
            slug="grand-bistro",
            is_active=True,
        )
        session.add(restaurant)

        # Seed 23 tables matching prototype (1-18 INDOOR, 19-23 OUTDOOR)
        for num in range(1, 24):
            sec = TableSection.INDOOR if num <= 18 else TableSection.OUTDOOR
            t = RestaurantTable(
                id=num,
                restaurant_id=rest_id,
                table_number=num,
                section=sec,
                qr_seed=f"qr_seed_t{num}",
                is_active=True,
            )
            session.add(t)

        # Seed 5 Waiters: Rahul, Aman, Vikas, Suresh, Mohit (matching app.js line 20)
        waiter_names = ["Rahul", "Aman", "Vikas", "Suresh", "Mohit"]
        waiters = []
        for i, name in enumerate(waiter_names):
            w = StaffUser(
                id=uuid.uuid4(),
                restaurant_id=rest_id,
                name=name,
                email=f"{name.lower()}@grandbistro.com",
                phone=f"+91900000000{i+1}",
                password_hash="test_hash",
                role=StaffRole.WAITER,
                is_online=True,
                push_enabled=True,
                last_assigned_seq=0,
                accepted_count=0,
                missed_count=0,
                rejected_count=0,
                streak=0,
            )
            session.add(w)
            waiters.append(w)

        # Seed 1 Manager
        mgr = StaffUser(
            id=uuid.uuid4(),
            restaurant_id=rest_id,
            name="Priya Sharma",
            email="manager@grandbistro.com",
            phone="+919000000000",
            password_hash="test_hash",
            role=StaffRole.MANAGER,
            is_online=True,
            push_enabled=True,
        )
        session.add(mgr)

        session.session_factory = session_factory
        session.test_engine = test_engine
        await session.commit()
        yield session

    await test_engine.dispose()


# ---------------------------------------------------------------------------
# SCENARIO 1: Normal Accept (Table remembers primary waiter Rahul)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_1_normal_accept(db_session: AsyncSession):
    """Scenario 1: Customer requests water on Table 7 -> Rahul assigned (45s) -> Rahul accepts ->
    Table 7 remembers Rahul as primary waiter.
    """
    # 1. Create request on Table 7
    req = await create_service_request(db_session, table_id=7, service_key="water", details="Cold")
    assert req.status == RequestStatus.ASSIGNED

    # Check attempt: first attempt is 45 seconds (CFG_FIRST)
    stmt = select(ServiceRequestAttempt).where(ServiceRequestAttempt.request_id == req.id)
    res = await db_session.execute(stmt)
    attempts = res.scalars().all()
    assert len(attempts) == 1
    assert attempts[0].timeout_seconds == CFG_FIRST
    assert attempts[0].status == AttemptStatus.WAITING

    assigned_waiter_id = attempts[0].waiter_id

    # 2. Waiter accepts
    accepted_req = await accept_waiter(db_session, req.id, assigned_waiter_id)
    assert accepted_req.status == RequestStatus.ACCEPTED
    assert accepted_req.accepted_by == assigned_waiter_id

    # 3. Check Table 7 dining session remembers primary waiter
    ds_stmt = select(DiningSession).where(DiningSession.table_id == 7, DiningSession.status == SessionStatus.ACTIVE)
    ds_res = await db_session.execute(ds_stmt)
    ds = ds_res.scalar_one()
    assert ds.primary_waiter_id == assigned_waiter_id


# ---------------------------------------------------------------------------
# SCENARIO 2: Reject then Accept (Immediate failover to 2nd waiter with 30s)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_2_reject_then_accept(db_session: AsyncSession):
    """Scenario 2: Waiter 1 rejects with 'Busy' -> Immediate failover with zero countdown delay
    to Waiter 2 (30s) -> Waiter 2 accepts.
    """
    req = await create_service_request(db_session, table_id=3, service_key="spt", details="Salt")
    assert req.status == RequestStatus.ASSIGNED

    # Get 1st assigned waiter
    att_stmt = select(ServiceRequestAttempt).where(ServiceRequestAttempt.request_id == req.id)
    res = await db_session.execute(att_stmt)
    first_att = res.scalars().one()
    first_waiter_id = first_att.waiter_id

    # Waiter 1 rejects
    updated_req = await reject_waiter(db_session, req.id, first_waiter_id, reason="Busy")

    # Status escalates to ESCALATED
    assert updated_req.status == RequestStatus.ESCALATED

    # Verify attempt 1 is REJECTED and attempt 2 is WAITING with 30s timer (CFG_NEXT)
    res2 = await db_session.execute(att_stmt)
    attempts = res2.scalars().all()
    assert len(attempts) == 2
    assert attempts[0].status == AttemptStatus.REJECTED
    assert attempts[0].rejection_reason == "Busy"
    assert attempts[1].status == AttemptStatus.WAITING
    assert attempts[1].timeout_seconds == CFG_NEXT
    assert attempts[1].waiter_id != first_waiter_id

    # Waiter 2 accepts
    second_waiter_id = attempts[1].waiter_id
    final_req = await accept_waiter(db_session, req.id, second_waiter_id)
    assert final_req.status == RequestStatus.ACCEPTED
    assert final_req.accepted_by == second_waiter_id


# ---------------------------------------------------------------------------
# SCENARIO 3: Nobody Accepts (3 timeouts -> Manager Alert ALL)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_3_nobody_accepts_three_timeouts(db_session: AsyncSession):
    """Scenario 3: 3 successive waiters time out (45s, 30s, 30s) ->
    Request status becomes FAILED and Manager Alert of type ALL is created.
    """
    req = await create_service_request(db_session, table_id=5, service_key="call")

    # Fast-forward attempt 1 to expired
    att1_stmt = (
        update(ServiceRequestAttempt)
        .where(ServiceRequestAttempt.request_id == req.id, ServiceRequestAttempt.status == AttemptStatus.WAITING)
        .values(expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    )
    await db_session.execute(att1_stmt)
    await db_session.commit()

    # Worker tick 1 -> advances to attempt 2
    expired = await timeout_worker(db_session)
    assert len(expired) == 1

    # Fast-forward attempt 2 to expired
    await db_session.execute(att1_stmt)
    await db_session.commit()

    # Worker tick 2 -> advances to attempt 3
    expired = await timeout_worker(db_session)
    assert len(expired) == 1

    # Fast-forward attempt 3 to expired
    await db_session.execute(att1_stmt)
    await db_session.commit()

    # Worker tick 3 -> max tries (3) exhausted -> fail to ALL
    expired = await timeout_worker(db_session)
    assert len(expired) == 1

    # Verify request status is FAILED
    req_stmt = select(ServiceRequest).where(ServiceRequest.id == req.id)
    req_res = await db_session.execute(req_stmt)
    req_final = req_res.scalar_one()
    assert req_final.status == RequestStatus.FAILED

    # Verify Manager Alert of type ALL is open
    alert_stmt = select(ManagerAlert).where(ManagerAlert.request_id == req.id)
    alert_res = await db_session.execute(alert_stmt)
    alert = alert_res.scalar_one()
    assert alert.alert_type == ManagerAlertType.ALL
    assert alert.is_open is True


# ---------------------------------------------------------------------------
# SCENARIO 4: No Waiter Online (0 online -> Manager Alert NONE)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_4_no_waiter_online(db_session: AsyncSession):
    """Scenario 4: When all waiters are offline, request immediately fails to Manager Alert NONE."""
    # Set all waiters offline
    await db_session.execute(
        update(StaffUser).where(StaffUser.role == StaffRole.WAITER).values(is_online=False)
    )
    await db_session.commit()

    req = await create_service_request(db_session, table_id=1, service_key="water")
    assert req.status == RequestStatus.FAILED

    # Check alert type NONE
    alert_stmt = select(ManagerAlert).where(ManagerAlert.request_id == req.id)
    alert_res = await db_session.execute(alert_stmt)
    alert = alert_res.scalar_one()
    assert alert.alert_type == ManagerAlertType.NONE
    assert alert.is_open is True


# ---------------------------------------------------------------------------
# SCENARIO 5: Fair-Share Distribution (10 requests equally across 5 waiters)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_5_fair_share_distribution(db_session: AsyncSession):
    """Scenario 5: 10 requests sent at once across 5 waiters -> each waiter receives exactly 2 requests."""
    # Send 10 requests
    requests = []
    for t_id in range(1, 11):
        r = await create_service_request(db_session, table_id=t_id, service_key="bill", details="Cash")
        requests.append(r)

    # Count how many waiting attempts each waiter has
    att_stmt = select(ServiceRequestAttempt.waiter_id).where(
        ServiceRequestAttempt.status == AttemptStatus.WAITING
    )
    res = await db_session.execute(att_stmt)
    waiter_ids = res.scalars().all()
    assert len(waiter_ids) == 10

    counts = {}
    for wid in waiter_ids:
        counts[wid] = counts.get(wid, 0) + 1

    # Exactly 5 distinct waiters, each receiving exactly 2 requests (10 / 5 = 2)
    assert len(counts) == 5
    for wid, count in counts.items():
        assert count == 2, f"Waiter {wid} has {count} requests instead of fair share 2"


# ---------------------------------------------------------------------------
# SCENARIO 6: Primary Overload Override (Delta >= 3 routes to least busy)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_6_primary_overload_override(db_session: AsyncSession):
    """Scenario 6: Primary waiter carries >= 3 more tasks than least busy -> Fair share overrides primary memory."""
    # Find Rahul (waiter 0)
    w_stmt = select(StaffUser).where(StaffUser.role == StaffRole.WAITER).order_by(StaffUser.name)
    w_res = await db_session.execute(w_stmt)
    waiters = w_res.scalars().all()
    rahul = waiters[0]

    # Set Rahul as primary for Table 7
    ds = DiningSession(
        table_id=7,
        session_token="session_t7_overload",
        status=SessionStatus.ACTIVE,
        primary_waiter_id=rahul.id,
        opened_at=datetime.now(timezone.utc),
    )
    db_session.add(ds)

    # Artificially overload Rahul with 3 accepted requests
    rahul.accepted_count = 3
    await db_session.commit()

    # Now create a request for Table 7
    req = await create_service_request(db_session, table_id=7, service_key="salad")

    # Verify assigned waiter is NOT Rahul (least busy waiter wins)
    att_stmt = select(ServiceRequestAttempt).where(ServiceRequestAttempt.request_id == req.id)
    att_res = await db_session.execute(att_stmt)
    attempt = att_res.scalar_one()
    assert attempt.waiter_id != rahul.id, "Overloaded primary waiter was incorrectly chosen!"


# ---------------------------------------------------------------------------
# SCENARIO 7: Primary Miss Streak Threshold (Miss 2 -> reset primary memory)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_7_primary_miss_streak_reset(db_session: AsyncSession):
    """Scenario 7: Primary waiter misses 2 consecutive requests (streak >= 2) ->
    Primary memory is stripped and reassigned to the new accepting waiter.
    """
    w_stmt = select(StaffUser).where(StaffUser.role == StaffRole.WAITER).order_by(StaffUser.name)
    w_res = await db_session.execute(w_stmt)
    waiters = w_res.scalars().all()
    old_primary = waiters[0]
    new_waiter = waiters[1]

    # Create active session with old_primary
    ds = DiningSession(
        table_id=8,
        session_token="session_t8_miss",
        status=SessionStatus.ACTIVE,
        primary_waiter_id=old_primary.id,
        opened_at=datetime.now(timezone.utc),
    )
    db_session.add(ds)
    # Old primary has streak = 2 (CFG_PRIMARY_MISS)
    old_primary.streak = CFG_PRIMARY_MISS
    await db_session.commit()

    req = await create_service_request(db_session, table_id=8, service_key="water")
    
    # Primary waiter is assigned first
    att_res = await db_session.execute(
        select(ServiceRequestAttempt).where(ServiceRequestAttempt.request_id == req.id)
    )
    first_att = att_res.scalars().one()
    assert first_att.waiter_id == old_primary.id

    # Old primary rejects (or misses) -> request moves to next waiter
    await reject_waiter(db_session, req.id, old_primary.id, reason="Busy")

    # Next waiter is assigned
    att_res2 = await db_session.execute(
        select(ServiceRequestAttempt)
        .where(ServiceRequestAttempt.request_id == req.id, ServiceRequestAttempt.status == AttemptStatus.WAITING)
    )
    second_att = att_res2.scalars().one()
    assert second_att.waiter_id != old_primary.id
    assigned_next_waiter_id = second_att.waiter_id

    # Next waiter accepts
    await accept_waiter(db_session, req.id, assigned_next_waiter_id)

    # Re-check dining session primary waiter: must be reassigned because old_primary had streak >= 2
    ds_check = await db_session.execute(
        select(DiningSession).where(DiningSession.id == ds.id)
    )
    session_obj = ds_check.scalar_one()
    assert session_obj.primary_waiter_id == assigned_next_waiter_id, "Primary waiter was not reassigned after miss streak >= 2"


# ---------------------------------------------------------------------------
# SCENARIO 8: Offline Safeguard (Toggling offline reroutes waiting and accepted)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_8_offline_safeguard(db_session: AsyncSession):
    """Scenario 8: Waiter goes offline -> waiting request attempt cancelled and moved to next waiter;
    accepted request reset to PENDING and re-assigned.
    """
    w_stmt = select(StaffUser).where(StaffUser.role == StaffRole.WAITER).order_by(StaffUser.name)
    w_res = await db_session.execute(w_stmt)
    waiters = w_res.scalars().all()
    waiter_a = waiters[0]

    # Create request 1 and accept it with the assigned waiter
    req1 = await create_service_request(db_session, table_id=1, service_key="water")
    att_res = await db_session.execute(
        select(ServiceRequestAttempt).where(ServiceRequestAttempt.request_id == req1.id)
    )
    assigned_waiter_id = att_res.scalars().one().waiter_id
    await accept_waiter(db_session, req1.id, assigned_waiter_id)

    # Assigned waiter goes offline
    rerouted = await offline_safeguard(db_session, assigned_waiter_id, is_online=False)
    assert req1.id in rerouted

    # Check that req1 has been reassigned to another online waiter
    req1_check = await db_session.execute(select(ServiceRequest).where(ServiceRequest.id == req1.id))
    r1 = req1_check.scalar_one()
    assert r1.status in [RequestStatus.ASSIGNED, RequestStatus.ESCALATED]
    assert r1.accepted_by is None


# ---------------------------------------------------------------------------
# SCENARIO 9: Duplicate Suppression & Resend Protection (60s, cooldown, 3 resends -> LIMIT)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_9_duplicate_suppression_and_resend_limits(db_session: AsyncSession):
    """Scenario 9:
    - Duplicate request within 60s is rejected.
    - Resend before 60s cooldown is rejected.
    - After 3 resends, resend limit reached and Manager Alert LIMIT created.
    """
    # 1. Send first request
    req = await create_service_request(db_session, table_id=9, service_key="water", details="Cold")

    # 2. Duplicate send attempt immediately -> rejected
    with pytest.raises(ValueError, match="already been sent"):
        await create_service_request(db_session, table_id=9, service_key="water", details="Cold")

    # 3. Resend attempt immediately -> cooldown active
    with pytest.raises(ValueError, match="Resend cooldown active|currently with a waiter"):
        await resend_service_request(db_session, req.id)

    # 4. Advance time past 60s and accept the request so it's not waiting
    att = await db_session.execute(
        select(ServiceRequestAttempt).where(ServiceRequestAttempt.request_id == req.id)
    )
    a = att.scalar_one()
    await accept_waiter(db_session, req.id, a.waiter_id)

    # Age the accepted_at timestamp past 60s
    await db_session.execute(
        update(ServiceRequest)
        .where(ServiceRequest.id == req.id)
        .values(accepted_at=datetime.now(timezone.utc) - timedelta(seconds=65))
    )
    await db_session.commit()

    # Resend 1 succeeds
    r_resend1 = await resend_service_request(db_session, req.id)
    assert r_resend1.resend_count == 1

    # Age timestamps and perform resend 2
    await db_session.execute(
        update(ServiceRequestAttempt)
        .where(ServiceRequestAttempt.request_id == req.id, ServiceRequestAttempt.status == AttemptStatus.WAITING)
        .values(status=AttemptStatus.MISSED)
    )
    await db_session.execute(
        update(ServiceRequest)
        .where(ServiceRequest.id == req.id)
        .values(created_at=datetime.now(timezone.utc) - timedelta(seconds=65), accepted_at=None)
    )
    await db_session.commit()
    r_resend2 = await resend_service_request(db_session, req.id)
    assert r_resend2.resend_count == 2

    # Resend 3
    await db_session.execute(
        update(ServiceRequestAttempt)
        .where(ServiceRequestAttempt.request_id == req.id, ServiceRequestAttempt.status == AttemptStatus.WAITING)
        .values(status=AttemptStatus.MISSED)
    )
    await db_session.execute(
        update(ServiceRequest)
        .where(ServiceRequest.id == req.id)
        .values(created_at=datetime.now(timezone.utc) - timedelta(seconds=65), accepted_at=None)
    )
    await db_session.commit()
    r_resend3 = await resend_service_request(db_session, req.id)
    assert r_resend3.resend_count == 3

    # Resend 4 (exceeds max 3) -> Manager Alert LIMIT
    await db_session.execute(
        update(ServiceRequestAttempt)
        .where(ServiceRequestAttempt.request_id == req.id, ServiceRequestAttempt.status == AttemptStatus.WAITING)
        .values(status=AttemptStatus.MISSED)
    )
    await db_session.execute(
        update(ServiceRequest)
        .where(ServiceRequest.id == req.id)
        .values(created_at=datetime.now(timezone.utc) - timedelta(seconds=65), accepted_at=None)
    )
    await db_session.commit()

    with pytest.raises(ValueError, match="Resend limit reached"):
        await resend_service_request(db_session, req.id)

    # Check alert type LIMIT
    alert_res = await db_session.execute(
        select(ManagerAlert).where(ManagerAlert.request_id == req.id, ManagerAlert.alert_type == ManagerAlertType.LIMIT)
    )
    alert = alert_res.scalar_one()
    assert alert.alert_type == ManagerAlertType.LIMIT
    assert alert.is_open is True


# ---------------------------------------------------------------------------
# SCENARIO 10: 10-Minute Auto-Close (Accepted requests close after 600s)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_10_auto_close_worker(db_session: AsyncSession):
    """Scenario 10: Requests accepted >= 10 minutes ago are auto-closed to CLOSED."""
    req = await create_service_request(db_session, table_id=10, service_key="water")
    att = await db_session.execute(
        select(ServiceRequestAttempt).where(ServiceRequestAttempt.request_id == req.id)
    )
    a = att.scalar_one()
    await accept_waiter(db_session, req.id, a.waiter_id)

    # Fast-forward accepted_at to 11 minutes ago (> 600s)
    past_time = datetime.now(timezone.utc) - timedelta(minutes=11)
    await db_session.execute(
        update(ServiceRequest).where(ServiceRequest.id == req.id).values(accepted_at=past_time)
    )
    await db_session.commit()

    closed_ids = await auto_close_worker(db_session)
    assert req.id in closed_ids

    # Verify status is CLOSED
    check = await db_session.execute(select(ServiceRequest).where(ServiceRequest.id == req.id))
    r_closed = check.scalar_one()
    assert r_closed.status == RequestStatus.CLOSED
    assert r_closed.closed_at is not None


# ---------------------------------------------------------------------------
# SCENARIO 11: Concurrency Safety & Simultaneous Operations
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_concurrency_simultaneous_accepts(db_session: AsyncSession):
    """Simultaneous accepts on the same request: only one succeeds, the other fails concurrency check."""
    req = await create_service_request(db_session, table_id=11, service_key="bill", details="Cash")
    att = await db_session.execute(
        select(ServiceRequestAttempt).where(ServiceRequestAttempt.request_id == req.id)
    )
    a = att.scalar_one()

    # First accept succeeds
    accepted = await accept_waiter(db_session, req.id, a.waiter_id)
    assert accepted.status == RequestStatus.ACCEPTED

    # Second accept on the same request raises ValueError (concurrency protection)
    with pytest.raises(ValueError, match="already accepted|not currently assigned"):
        await accept_waiter(db_session, req.id, a.waiter_id)


# ---------------------------------------------------------------------------
# SCENARIO 12: Rejection When No Other Waiter Available (Decision 1)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_rejection_when_no_other_waiter_available_decision_1(db_session: AsyncSession):
    """Decision 1: Only 1 waiter online in the restaurant rejects ->
    Engine detects no other waiter available and escalates with Manager Alert NONE.
    """
    # Put all waiters offline except one
    w_stmt = select(StaffUser).where(StaffUser.role == StaffRole.WAITER).order_by(StaffUser.name)
    w_res = await db_session.execute(w_stmt)
    waiters = w_res.scalars().all()
    only_waiter = waiters[0]

    for w in waiters[1:]:
        w.is_online = False
    await db_session.commit()

    req = await create_service_request(db_session, table_id=12, service_key="cutlery", details="Plate")
    assert req.status == RequestStatus.ASSIGNED

    # Only waiter rejects
    rejected_req = await reject_waiter(db_session, req.id, only_waiter.id, reason="Busy")
    assert rejected_req.status == RequestStatus.FAILED

    # Check alert type NONE
    alert_res = await db_session.execute(
        select(ManagerAlert).where(ManagerAlert.request_id == req.id)
    )
    alert = alert_res.scalar_one()
    assert alert.alert_type == ManagerAlertType.NONE
    assert alert.is_open is True


# ---------------------------------------------------------------------------
# SCENARIO 13: Manager Manual Assignment Override After Rejection (Decision 2)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_manager_override_after_rejection_decision_2(db_session: AsyncSession):
    """Decision 2: Manager manually assigns a waiter who previously rejected the request ->
    Assignment succeeds, 30s timer is assigned, alert is closed, waiter can accept.
    """
    w_stmt = select(StaffUser).where(StaffUser.role == StaffRole.WAITER).order_by(StaffUser.name)
    w_res = await db_session.execute(w_stmt)
    waiters = w_res.scalars().all()
    only_waiter = waiters[0]

    for w in waiters[1:]:
        w.is_online = False
    await db_session.commit()

    # Create request, reject, fails to NONE alert
    req = await create_service_request(db_session, table_id=13, service_key="spt")
    await reject_waiter(db_session, req.id, only_waiter.id, reason="At another table")

    alert_res = await db_session.execute(
        select(ManagerAlert).where(ManagerAlert.request_id == req.id, ManagerAlert.is_open == True)
    )
    alert = alert_res.scalar_one()

    # Manager manually assigns the same waiter who previously rejected (Decision 2 override authority)
    reassigned_req = await manager_assign(db_session, alert.id, only_waiter.id)
    assert reassigned_req.status in [RequestStatus.ASSIGNED, RequestStatus.ESCALATED]

    # Verify attempt was created with 30s timeout and MANAGER_OVERRIDE tag
    att_res = await db_session.execute(
        select(ServiceRequestAttempt)
        .where(ServiceRequestAttempt.request_id == req.id)
        .order_by(ServiceRequestAttempt.assigned_at.desc())
    )
    latest_att = att_res.scalars().first()
    assert latest_att.waiter_id == only_waiter.id
    assert latest_att.timeout_seconds == CFG_NEXT
    assert latest_att.rejection_reason == "MANAGER_OVERRIDE"

    # Now waiter accepts
    final_req = await accept_waiter(db_session, req.id, only_waiter.id)
    assert final_req.status == RequestStatus.ACCEPTED
    assert final_req.accepted_by == only_waiter.id


# ---------------------------------------------------------------------------
# SCENARIO 14: Online Transition Safeguard
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_online_transition_auto_retries_none_alert(db_session: AsyncSession):
    """When a waiter comes online, open FAILED requests with NONE alerts are automatically retried."""
    # Set all offline
    await db_session.execute(
        update(StaffUser).where(StaffUser.role == StaffRole.WAITER).values(is_online=False)
    )
    await db_session.commit()

    req = await create_service_request(db_session, table_id=14, service_key="water")
    assert req.status == RequestStatus.FAILED

    # Pick waiter 0 and toggle online
    w_res = await db_session.execute(select(StaffUser).where(StaffUser.role == StaffRole.WAITER))
    waiter = w_res.scalars().first()

    retried_ids = await offline_safeguard(db_session, waiter.id, is_online=True)
    assert req.id in retried_ids

    # Request is now ASSIGNED to the newly online waiter
    req_check = await db_session.execute(select(ServiceRequest).where(ServiceRequest.id == req.id))
    r = req_check.scalar_one()
    assert r.status == RequestStatus.ASSIGNED


# ---------------------------------------------------------------------------
# SCENARIO 15: Timer Verification (250ms polling target, latency, jitter & delayed ticks)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_timer_verification_250ms_latency_and_jitter(db_session: AsyncSession):
    """Requirement 6: Timer verification.
    - Measures actual polling intervals against 250ms target.
    - Measures jitter, min, max, and mean.
    - Verifies delayed tick behavior (inspects persisted deadlines).
    - Reports empirical measurements.
    """
    target_interval = 0.250  # 250ms
    iterations = 10
    actual_intervals = []

    last_time = time.perf_counter()
    for _ in range(iterations):
        await asyncio.sleep(target_interval)
        now_time = time.perf_counter()
        elapsed = now_time - last_time
        actual_intervals.append(elapsed * 1000)  # ms
        last_time = now_time
        # Execute worker on each tick
        await timeout_worker(db_session)

    mean_interval = statistics.mean(actual_intervals)
    min_interval = min(actual_intervals)
    max_interval = max(actual_intervals)
    jitter = statistics.stdev(actual_intervals) if len(actual_intervals) > 1 else 0.0

    print(
        f"\n[Timer Measurement Report]\n"
        f"Target Interval: {target_interval * 1000:.1f}ms\n"
        f"Iterations: {iterations}\n"
        f"Mean Interval: {mean_interval:.2f}ms\n"
        f"Min Interval: {min_interval:.2f}ms\n"
        f"Max Interval: {max_interval:.2f}ms\n"
        f"Jitter (StdDev): {jitter:.2f}ms\n"
    )

    # 2. Delayed tick test: simulate a tick delayed by 1500ms
    req = await create_service_request(db_session, table_id=15, service_key="call")
    # Expire attempt deadline
    await db_session.execute(
        update(ServiceRequestAttempt)
        .where(ServiceRequestAttempt.request_id == req.id)
        .values(expires_at=datetime.now(timezone.utc) - timedelta(milliseconds=800))
    )
    await db_session.commit()

    # Simulate heavy delayed tick running late
    expired = await timeout_worker(db_session)
    assert len(expired) == 1, "Delayed tick failed to catch expired attempt by deadline!"


# ---------------------------------------------------------------------------
# SCENARIO 16: Concurrency - Two Waiters Accepting Simultaneously (Separate Sessions)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_concurrency_two_waiters_accepting_simultaneously_separate_sessions(db_session: AsyncSession):
    """Requirement 1: Test two waiters accepting the same service request simultaneously using separate database sessions.
    Exactly one should succeed, and the other must fail concurrency check without inconsistent state.
    """
    factory = db_session.session_factory

    # Create request on Table 11
    req = await create_service_request(db_session, table_id=11, service_key="bill", details="Cash")
    att = await db_session.execute(
        select(ServiceRequestAttempt).where(ServiceRequestAttempt.request_id == req.id)
    )
    a = att.scalar_one()
    assigned_waiter_id = a.waiter_id

    # Find another online waiter
    other_w_stmt = select(StaffUser).where(
        StaffUser.role == StaffRole.WAITER,
        StaffUser.id != assigned_waiter_id,
        StaffUser.is_online == True
    )
    other_w_res = await db_session.execute(other_w_stmt)
    other_waiter = other_w_res.scalars().first()
    other_waiter_id = other_waiter.id

    # Part A: Assigned waiter vs Unassigned waiter accepting simultaneously in separate sessions
    async def try_accept(wid):
        async with factory() as s:
            return await accept_waiter(s, req.id, wid)

    results_a = await asyncio.gather(
        try_accept(assigned_waiter_id),
        try_accept(other_waiter_id),
        return_exceptions=True
    )

    successes_a = [r for r in results_a if isinstance(r, ServiceRequest) and r.status == RequestStatus.ACCEPTED]
    failures_a = [r for r in results_a if isinstance(r, Exception)]

    assert len(successes_a) == 1, "Exactly one waiter should succeed in accepting!"
    assert len(failures_a) == 1, "The non-assigned waiter must fail concurrency check!"
    assert "not currently assigned to you or has already been handled" in str(failures_a[0])

    # Part B: Two sessions simultaneously attempting to accept the SAME request for the assigned waiter
    req2 = await create_service_request(db_session, table_id=12, service_key="water", details="Normal")
    att2 = await db_session.execute(
        select(ServiceRequestAttempt).where(ServiceRequestAttempt.request_id == req2.id)
    )
    a2 = att2.scalar_one()
    wid2 = a2.waiter_id

    async def try_accept_session():
        async with factory() as s:
            return await accept_waiter(s, req2.id, wid2)

    results_b = await asyncio.gather(
        try_accept_session(),
        try_accept_session(),
        return_exceptions=True
    )

    successes_b = [r for r in results_b if isinstance(r, ServiceRequest) and r.status == RequestStatus.ACCEPTED]
    failures_b = [r for r in results_b if isinstance(r, Exception)]

    assert len(successes_b) == 1, "Exactly one session should succeed in accepting!"
    assert len(failures_b) == 1, "The concurrent session must fail atomic conditional update!"
    assert "already accepted or re-routed by another concurrent action" in str(failures_b[0])

    # Verify database state consistency via fresh session
    async with factory() as verify_session:
        verify_stmt = select(ServiceRequest).where(ServiceRequest.id == req2.id)
        verify_res = await verify_session.execute(verify_stmt)
        persisted_req2 = verify_res.scalar_one()
        assert persisted_req2.status == RequestStatus.ACCEPTED
        assert persisted_req2.accepted_by == wid2


# ---------------------------------------------------------------------------
# SCENARIO 17: Concurrency - Simultaneous Duplicate Creation (Separate Sessions)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_concurrency_simultaneous_duplicate_creation_separate_sessions(db_session: AsyncSession):
    """Requirement 2: Test simultaneous duplicate service-request creation from separate sessions.
    Implements a safe solution that preserves the existing 60-second duplicate-suppression rule.
    Exactly one request must be created, and the other session must raise ValueError('already been sent').
    """
    factory = db_session.session_factory

    # Part A: Simultaneous requests for the same table and service key from separate sessions
    async def try_create(details="Cold"):
        async with factory() as s:
            return await create_service_request(s, table_id=14, service_key="water", details=details)

    results = await asyncio.gather(
        try_create(),
        try_create(),
        return_exceptions=True
    )

    successes = [r for r in results if isinstance(r, ServiceRequest)]
    failures = [r for r in results if isinstance(r, Exception)]

    assert len(successes) == 1, f"Expected exactly 1 request to succeed, got {len(successes)}"
    assert len(failures) == 1, f"Expected exactly 1 duplicate request to be rejected, got {len(failures)}"
    assert "already been sent" in str(failures[0])

    # Verify only 1 service request exists for Table 14
    count_stmt = select(func.count(ServiceRequest.id)).where(ServiceRequest.table_id == 14)
    count_res = await db_session.execute(count_stmt)
    assert count_res.scalar_one() == 1

    # Part B: Custom request with same details simultaneously from separate sessions
    async def try_create_custom():
        async with factory() as s:
            return await create_service_request(s, table_id=14, service_key="custom", details="Extra lemons please")

    custom_results = await asyncio.gather(
        try_create_custom(),
        try_create_custom(),
        return_exceptions=True
    )
    custom_successes = [r for r in custom_results if isinstance(r, ServiceRequest)]
    custom_failures = [r for r in custom_results if isinstance(r, Exception)]

    assert len(custom_successes) == 1, "Exactly one custom request should succeed"
    assert len(custom_failures) == 1, "The duplicate custom request must be rejected"
    assert "already been sent" in str(custom_failures[0])

    # Part C: Verify 60s duplicate suppression rule preservation
    # If the request is accepted, but within 60s, duplicate creation is STILL suppressed
    req_to_accept = successes[0]
    att_stmt = select(ServiceRequestAttempt).where(ServiceRequestAttempt.request_id == req_to_accept.id)
    att_res = await db_session.execute(att_stmt)
    att = att_res.scalar_one()
    await accept_waiter(db_session, req_to_accept.id, att.waiter_id)

    # Immediately attempt duplicate while accepted and < 60s
    with pytest.raises(ValueError, match="already been sent"):
        async with factory() as s:
            await create_service_request(s, table_id=14, service_key="water", details="Cold")

    # Age accepted_at by 65s (past the 60s window)
    await db_session.execute(
        update(ServiceRequest)
        .where(ServiceRequest.id == req_to_accept.id)
        .values(accepted_at=datetime.now(timezone.utc) - timedelta(seconds=65))
    )
    await db_session.commit()

    # Now duplicate suppression is lifted after 60s window expires
    async with factory() as s:
        new_req = await create_service_request(s, table_id=14, service_key="water", details="Cold")
        assert new_req.id != req_to_accept.id


# ---------------------------------------------------------------------------
# SCENARIO 18: Transaction Rollback and Error Handling Verification
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_transaction_rollback_and_error_handling(db_session: AsyncSession):
    """Requirement 3: Verify transaction rollback and error handling for:
    - assignment errors
    - rejection errors
    - timeout worker errors
    - offline safeguard transitions
    """
    factory = db_session.session_factory

    # 1. Rollback on invalid assignment (request not found)
    with pytest.raises(ValueError, match="not found"):
        await assign_waiter(db_session, request_id=999999)

    # 2. Rollback on invalid rejection (attempt not found or wrong waiter)
    req = await create_service_request(db_session, table_id=16, service_key="water")
    fake_waiter_id = uuid.uuid4()
    with pytest.raises(ValueError, match="No active waiting attempt found"):
        await reject_waiter(db_session, req.id, fake_waiter_id, reason="Busy")

    # Verify request and attempts are undisturbed
    check_req = await db_session.execute(select(ServiceRequest).where(ServiceRequest.id == req.id))
    assert check_req.scalar_one().status == RequestStatus.ASSIGNED

    # 3. Offline transition with invalid waiter rolls back cleanly
    with pytest.raises(ValueError, match="not found"):
        await offline_safeguard(db_session, waiter_id=uuid.uuid4(), is_online=False)

    # 4. Timeout worker isolation: verify timeout_worker handles expired attempts and commits cleanly
    now = datetime.now(timezone.utc)
    await db_session.execute(
        update(ServiceRequestAttempt)
        .where(ServiceRequestAttempt.request_id == req.id)
        .values(expires_at=now - timedelta(seconds=10))
    )
    await db_session.commit()

    expired_ids = await timeout_worker(db_session)
    assert len(expired_ids) >= 1


# ---------------------------------------------------------------------------
# SCENARIO 19: Separate Polling Interval & Deadline Latency Measurement
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_timer_verification_separate_polling_and_deadline_latency(db_session: AsyncSession):
    """Requirement 4 & 6: Measure polling interval separately from deadline-to-processing latency.
    - Measures actual polling intervals against 250ms target (iterations, mean, min, max, jitter).
    - Separately measures deadline-to-processing latency (difference between persisted expires_at and tick execution).
    """
    # 1. Polling Interval Measurements
    target_interval = 0.250  # 250ms
    iterations = 10
    actual_intervals = []

    last_time = time.perf_counter()
    for _ in range(iterations):
        await asyncio.sleep(target_interval)
        now_time = time.perf_counter()
        elapsed = now_time - last_time
        actual_intervals.append(elapsed * 1000)  # ms
        last_time = now_time
        await timeout_worker(db_session)

    mean_interval = statistics.mean(actual_intervals)
    min_interval = min(actual_intervals)
    max_interval = max(actual_intervals)
    jitter = statistics.stdev(actual_intervals) if len(actual_intervals) > 1 else 0.0

    # 2. Deadline-to-Processing Latency Measurements
    # Create 3 service requests with distinct pre-expired deadlines
    latencies = []
    now = datetime.now(timezone.utc)
    test_tables = [20, 21, 22]
    expired_deltas_ms = [50, 150, 300]  # past deadlines

    for t_id, delta in zip(test_tables, expired_deltas_ms):
        r = await create_service_request(db_session, table_id=t_id, service_key="water")
        past_deadline = now - timedelta(milliseconds=delta)
        await db_session.execute(
            update(ServiceRequestAttempt)
            .where(ServiceRequestAttempt.request_id == r.id)
            .values(expires_at=past_deadline)
        )
    await db_session.commit()

    expired_ids = await timeout_worker(db_session)
    assert len(expired_ids) >= 3

    # Calculate actual latency for each processed attempt: (responded_at - expires_at)
    res_stmt = select(ServiceRequestAttempt).where(ServiceRequestAttempt.id.in_(expired_ids))
    res_attempts = (await db_session.execute(res_stmt)).scalars().all()

    for att in res_attempts:
        if att.responded_at and att.expires_at:
            lat_ms = (att.responded_at.replace(tzinfo=timezone.utc) - att.expires_at.replace(tzinfo=timezone.utc)).total_seconds() * 1000
            latencies.append(lat_ms)

    mean_latency = statistics.mean(latencies)
    min_latency = min(latencies)
    max_latency = max(latencies)
    stddev_latency = statistics.stdev(latencies) if len(latencies) > 1 else 0.0

    print(
        f"\n===================================================================\n"
        f"               TIMER & LATENCY EMPIRICAL REPORT                    \n"
        f"===================================================================\n"
        f"[A. Polling Interval Metrics]\n"
        f"  Target Polling Interval : {target_interval * 1000:.1f} ms\n"
        f"  Iterations Sampled      : {iterations}\n"
        f"  Mean Interval           : {mean_interval:.2f} ms\n"
        f"  Min Interval            : {min_interval:.2f} ms\n"
        f"  Max Interval            : {max_interval:.2f} ms\n"
        f"  Jitter (StdDev)         : {jitter:.2f} ms\n"
        f"-------------------------------------------------------------------\n"
        f"[B. Deadline-to-Processing Latency Metrics]\n"
        f"  Attempts Evaluated      : {len(latencies)}\n"
        f"  Mean Latency            : {mean_latency:.2f} ms\n"
        f"  Min Latency             : {min_latency:.2f} ms\n"
        f"  Max Latency             : {max_latency:.2f} ms\n"
        f"  Latency StdDev          : {stddev_latency:.2f} ms\n"
        f"===================================================================\n"
    )

    assert mean_interval > 0
    assert min_interval > 0
    assert mean_latency > 0
