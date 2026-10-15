"""Algorithmic Waiter Routing Engine for Smart Table Service.

Strictly preserves and enforces all business logic from original app.js:
- 1st waiter 45s, 2nd & 3rd 30s each, max 3 tries.
- Primary waiter memory (P[table]) unless overloaded by >= 3 tasks (CFG.OVERLOAD = 3).
- Fair-share workload ranking formula: fs = acc + waiting; load = accepted_active + waiting; last_assigned_seq.
- Immediate rejection rerouting with zero countdown delay.
- Escalation to Manager on 0 online waiters (NONE), 3 failed attempts (ALL), or 3 resends (LIMIT).
- Manager manual assignment override authority over previous rejections (Decision 2).
- Preservation of NONE escalation behavior when no waiter is available (Decision 1).
- Offline safeguards (re-routing waiting and accepted tasks on offline; retrying NONE alerts on online).
- Duplicate suppression (60s) and resend cooldown (60s).
- 10-minute auto-close for accepted requests.
"""

import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Tuple, Set
from sqlalchemy import select, update, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.staff_user import StaffUser, StaffRole
from app.models.table import RestaurantTable, DiningSession, SessionStatus
from app.models.service_request import (
    ServiceRequest,
    ServiceRequestAttempt,
    ManagerAlert,
    RequestStatus,
    AttemptStatus,
    ManagerAlertType,
)

# Configuration Constants matching original app.js (line 9)
CFG_FIRST = 45             # 1st waiter timeout (seconds)
CFG_NEXT = 30              # Subsequent waiters timeout (seconds)
CFG_TRIES = 3              # Max waiter attempts before manager alert
CFG_RESEND_MS = 60000      # Resend cooldown (milliseconds = 60s)
CFG_RESEND_MAX = 3         # Max resends per request
CFG_CLOSE_MS = 600000      # Auto-close after accept (milliseconds = 10 minutes)
CFG_OVERLOAD = 3           # Primary waiter overload threshold delta
CFG_PRIMARY_MISS = 2       # Miss streak count to reset primary waiter
CFG_DUP_ACCEPT_MS = 60000  # Duplicate suppression window for accepted requests (60s)

# Concurrency mutex for duplicate service request suppression
_creation_locks_guard = asyncio.Lock()
_creation_locks: dict[tuple, asyncio.Lock] = {}


async def _acquire_creation_lock(key: tuple) -> asyncio.Lock:
    """Get or create an asyncio.Lock for a specific table request signature."""
    async with _creation_locks_guard:
        if key not in _creation_locks:
            _creation_locks[key] = asyncio.Lock()
        return _creation_locks[key]


def _get_utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def get_waiter_metrics(session: AsyncSession, waiter: StaffUser) -> Tuple[int, int]:
    """Calculate fair-share score (fs) and active load (load) for a waiter.
    
    fs(w) = w.accepted_count + currently waiting requests
    load(w) = active accepted requests + currently waiting requests
    """
    # Count currently waiting requests assigned to this waiter
    waiting_stmt = select(func.count(ServiceRequestAttempt.id)).where(
        ServiceRequestAttempt.waiter_id == waiter.id,
        ServiceRequestAttempt.status == AttemptStatus.WAITING,
    )
    res_waiting = await session.execute(waiting_stmt)
    waiting_count = res_waiting.scalar_one() or 0

    # Count currently active accepted requests by this waiter
    accepted_stmt = select(func.count(ServiceRequest.id)).where(
        ServiceRequest.accepted_by == waiter.id,
        ServiceRequest.status == RequestStatus.ACCEPTED,
    )
    res_accepted = await session.execute(accepted_stmt)
    active_accepted_count = res_accepted.scalar_one() or 0

    fs = waiter.accepted_count + waiting_count
    load = active_accepted_count + waiting_count
    return fs, load


async def pick_waiter(
    session: AsyncSession,
    restaurant_id: uuid.UUID,
    table_id: int,
    excluded_waiter_ids: Set[uuid.UUID],
    is_first_try: bool,
) -> Optional[StaffUser]:
    """Pick next waiter using exact pick() rules from app.js (lines 41-46):
    1. Filter online waiters not in excluded list.
    2. Filter push_enabled == True if any exist; otherwise fallback to all online.
    3. Sort pool by rank(a, b): fs -> load -> last_assigned_seq.
    4. Table memory: if primary waiter is eligible and not overloaded (fs(p) - fs(best) < 3), pick primary.
    5. Otherwise pick best.
    """
    # 1. Query online waiters for the restaurant
    stmt = select(StaffUser).where(
        StaffUser.restaurant_id == restaurant_id,
        StaffUser.role == StaffRole.WAITER,
        StaffUser.is_online == True,
    )
    if excluded_waiter_ids:
        stmt = stmt.where(StaffUser.id.not_in(list(excluded_waiter_ids)))

    res = await session.execute(stmt)
    eligible_waiters = res.scalars().all()
    if not eligible_waiters:
        return None

    # 2. Prefer push_enabled == True
    push_pool = [w for w in eligible_waiters if w.push_enabled]
    pool = push_pool if push_pool else eligible_waiters

    # 3. Calculate metrics and sort by rank
    # rank(a, b) = fs(a) - fs(b) || load(a) - load(b) || a.last - b.last
    waiters_with_metrics = []
    for w in pool:
        fs, load = await get_waiter_metrics(session, w)
        waiters_with_metrics.append((w, fs, load, w.last_assigned_seq))

    waiters_with_metrics.sort(key=lambda x: (x[1], x[2], x[3]))
    best_tuple = waiters_with_metrics[0]
    best_waiter, best_fs, _, _ = best_tuple

    # 4. Check primary waiter memory for this table
    session_stmt = (
        select(DiningSession)
        .where(DiningSession.table_id == table_id, DiningSession.status == SessionStatus.ACTIVE)
        .order_by(DiningSession.opened_at.desc())
    )
    res_session = await session.execute(session_stmt)
    dining_session = res_session.scalars().first()

    if dining_session and dining_session.primary_waiter_id and is_first_try:
        primary_match = next((t for t in waiters_with_metrics if t[0].id == dining_session.primary_waiter_id), None)
        if primary_match:
            primary_waiter, primary_fs, _, _ = primary_match
            # Primary memory wins unless overloaded by >= CFG_OVERLOAD (3) tasks
            if primary_fs - best_fs < CFG_OVERLOAD:
                return primary_waiter

    return best_waiter


async def fail_request(session: AsyncSession, request: ServiceRequest, alert_type: ManagerAlertType) -> ManagerAlert:
    """Escalate a request to the Manager dashboard (matching app.js fail(), line 55)."""
    request.status = RequestStatus.FAILED

    alert = ManagerAlert(
        request_id=request.id,
        alert_type=alert_type,
        is_open=True,
        created_at=_get_utc_now(),
    )
    session.add(alert)
    await session.flush()
    return alert


async def assign_waiter(
    session: AsyncSession,
    request_id: int,
    manager_waiter_id: Optional[uuid.UUID] = None,
) -> ServiceRequest:
    """Assign next waiter or manager-assigned waiter (matching app.js assign(), line 47)."""
    try:
        # Load request
        stmt = select(ServiceRequest).where(ServiceRequest.id == request_id)
        res = await session.execute(stmt)
        request = res.scalar_one_or_none()
        if not request:
            raise ValueError(f"ServiceRequest #{request_id} not found")

        # Load table to get restaurant_id
        table_stmt = select(RestaurantTable).where(RestaurantTable.id == request.table_id)
        table_res = await session.execute(table_stmt)
        table = table_res.scalar_one()

        # Load attempts directly from database to avoid stale relationship cache
        att_stmt = (
            select(ServiceRequestAttempt)
            .where(ServiceRequestAttempt.request_id == request_id)
            .order_by(ServiceRequestAttempt.id)
        )
        att_res = await session.execute(att_stmt)
        all_attempts = att_res.scalars().all()

        # Valid attempts (tries) count in current cycle:
        # Excludes manager assignments and cancelled (offline) attempts
        current_cycle_attempts = [
            a for a in all_attempts 
            if (a.attempt_number // 10) == request.resend_count
        ]
        valid_tries = [
            a for a in current_cycle_attempts 
            if a.status != AttemptStatus.CANCELLED and a.rejection_reason != "MANAGER_OVERRIDE"
        ]
        tries_count = len(valid_tries)

        # 1. Determine assigned waiter
        assigned_waiter: Optional[StaffUser] = None
        if manager_waiter_id is not None:
            # Manager manual assignment: has full authority to assign any online waiter (Decision 2)
            w_stmt = select(StaffUser).where(StaffUser.id == manager_waiter_id, StaffUser.is_online == True)
            w_res = await session.execute(w_stmt)
            assigned_waiter = w_res.scalar_one_or_none()
            if not assigned_waiter:
                raise ValueError("Manager assigned waiter is not online or does not exist")
            # If request was previously accepted by another waiter, clear previous accepted_by
            if request.accepted_by is not None:
                request.accepted_by = None
        else:
            # Build exclusion list of waiters who already have attempts on this request in this cycle
            # plus any waiter who previously accepted this request in prior cycles
            cycle_waiter_ids = {a.waiter_id for a in current_cycle_attempts}
            previously_accepted_ids = {
                a.waiter_id for a in all_attempts 
                if a.status == AttemptStatus.ACCEPTED
            }
            excluded_ids = cycle_waiter_ids.union(previously_accepted_ids)

            is_first_try = (tries_count == 0)
            assigned_waiter = await pick_waiter(
                session=session,
                restaurant_id=table.restaurant_id,
                table_id=request.table_id,
                excluded_waiter_ids=excluded_ids,
                is_first_try=is_first_try,
            )

        # If no waiter is available: escalate to manager
        if not assigned_waiter:
            # Decision 1 & app.js:
            # If 3 attempts exhausted -> ALL
            # If no waiter is available in the online pool -> NONE
            if tries_count >= CFG_TRIES:
                alert_type = ManagerAlertType.ALL
            else:
                alert_type = ManagerAlertType.NONE
            await fail_request(session, request, alert_type)
            await session.commit()
            return request

        # Update waiter sequence for LRU tie breaking
        now = _get_utc_now()
        assigned_waiter.last_assigned_seq = int(now.timestamp() * 1_000_000)

        # Close any open manager alerts for this request
        close_alerts_stmt = (
            update(ManagerAlert)
            .where(ManagerAlert.request_id == request.id, ManagerAlert.is_open == True)
            .values(is_open=False, resolved_at=now)
        )
        await session.execute(close_alerts_stmt)

        # Cancel any previous WAITING attempts for this request to guarantee single active assignee
        await session.execute(
            update(ServiceRequestAttempt)
            .where(
                ServiceRequestAttempt.request_id == request.id,
                ServiceRequestAttempt.status == AttemptStatus.WAITING,
            )
            .values(status=AttemptStatus.CANCELLED, responded_at=now)
        )

        # Determine countdown duration
        is_first = (manager_waiter_id is None and tries_count == 0)
        secs = CFG_FIRST if is_first else CFG_NEXT
        expires_at = now + timedelta(seconds=secs)

        # Update request status
        request.status = RequestStatus.ESCALATED if tries_count > 0 else RequestStatus.ASSIGNED

        # Calculate attempt number encoding the cycle: (resend_count * 10) + try_in_cycle
        attempt_num = (request.resend_count * 10) + (len(current_cycle_attempts) + 1)

        # Create new attempt
        attempt = ServiceRequestAttempt(
            request_id=request.id,
            waiter_id=assigned_waiter.id,
            attempt_number=attempt_num,
            status=AttemptStatus.WAITING,
            rejection_reason="MANAGER_OVERRIDE" if manager_waiter_id else None,
            timeout_seconds=secs,
            assigned_at=now,
            expires_at=expires_at,
            responded_at=None,
        )
        session.add(attempt)
        await session.commit()
        return request
    except ValueError:
        raise
    except Exception:
        session.expire_on_rollback = False
        await session.rollback()
        raise


async def next_waiter(session: AsyncSession, request_id: int) -> ServiceRequest:
    """Advance request to next waiter or fail with ALL if 3 tries exhausted (matching app.js next(), line 58)."""
    try:
        stmt = select(ServiceRequest).where(ServiceRequest.id == request_id)
        res = await session.execute(stmt)
        request = res.scalar_one_or_none()
        if not request:
            raise ValueError(f"ServiceRequest #{request_id} not found")

        att_stmt = (
            select(ServiceRequestAttempt)
            .where(ServiceRequestAttempt.request_id == request_id)
        )
        att_res = await session.execute(att_stmt)
        all_attempts = att_res.scalars().all()

        current_cycle_attempts = [
            a for a in all_attempts 
            if (a.attempt_number // 10) == request.resend_count
        ]
        valid_tries = [
            a for a in current_cycle_attempts 
            if a.status != AttemptStatus.CANCELLED and a.rejection_reason != "MANAGER_OVERRIDE"
        ]
        if len(valid_tries) >= CFG_TRIES:
            await fail_request(session, request, ManagerAlertType.ALL)
            await session.commit()
            return request
        else:
            return await assign_waiter(session, request_id)
    except ValueError:
        raise
    except Exception:
        session.expire_on_rollback = False
        await session.rollback()
        raise


async def accept_waiter(session: AsyncSession, request_id: int, waiter_id: uuid.UUID) -> ServiceRequest:
    """Waiter accepts request atomically (matching app.js accept(), line 82)."""
    try:
        now = _get_utc_now()

        # Verify attempt is still WAITING and not expired
        att_stmt = (
            select(ServiceRequestAttempt)
            .where(
                ServiceRequestAttempt.request_id == request_id,
                ServiceRequestAttempt.waiter_id == waiter_id,
                ServiceRequestAttempt.status == AttemptStatus.WAITING,
            )
            .order_by(ServiceRequestAttempt.assigned_at.desc())
            .with_for_update()
        )
        att_res = await session.execute(att_stmt)
        attempt = att_res.scalars().first()

        if not attempt:
            raise ValueError("This request is not currently assigned to you or has already been handled.")

        if _ensure_utc(now) >= _ensure_utc(attempt.expires_at):
            raise ValueError("This request has already expired.")

        # Concurrency-safe atomic conditional update on request
        req_update_stmt = (
            update(ServiceRequest)
            .where(
                ServiceRequest.id == request_id,
                ServiceRequest.status.in_([RequestStatus.ASSIGNED, RequestStatus.ESCALATED]),
            )
            .values(
                status=RequestStatus.ACCEPTED,
                accepted_by=waiter_id,
                accepted_at=now,
            )
        )
        res_update = await session.execute(req_update_stmt)
        if res_update.rowcount == 0:
            raise ValueError("Request was already accepted or re-routed by another concurrent action.")

        # Concurrency-safe atomic update on attempt
        att_update_stmt = (
            update(ServiceRequestAttempt)
            .where(
                ServiceRequestAttempt.id == attempt.id,
                ServiceRequestAttempt.status == AttemptStatus.WAITING,
            )
            .values(
                status=AttemptStatus.ACCEPTED,
                responded_at=now,
            )
        )
        res_att_update = await session.execute(att_update_stmt)
        if res_att_update.rowcount == 0:
            raise ValueError("Attempt was already handled or cancelled by another concurrent action.")

        # Update waiter stats: accepted_count++, streak=0
        waiter_stmt = select(StaffUser).where(StaffUser.id == waiter_id)
        w_res = await session.execute(waiter_stmt)
        waiter = w_res.scalar_one()
        waiter.accepted_count += 1
        waiter.streak = 0

        # Close any open manager alerts
        await session.execute(
            update(ManagerAlert)
            .where(ManagerAlert.request_id == request_id, ManagerAlert.is_open == True)
            .values(is_open=False, resolved_at=now)
        )

        # Primary waiter memory logic (app.js line 85):
        # Primary changes only if table has no primary, old primary is offline, or old primary streak >= 2
        req_stmt = select(ServiceRequest).where(ServiceRequest.id == request_id)
        r_res = await session.execute(req_stmt)
        request = r_res.scalar_one()
        request.status = RequestStatus.ACCEPTED
        request.accepted_by = waiter_id
        request.accepted_at = now

        ds_stmt = (
            select(DiningSession)
            .where(DiningSession.table_id == request.table_id, DiningSession.status == SessionStatus.ACTIVE)
            .order_by(DiningSession.opened_at.desc())
        )
        ds_res = await session.execute(ds_stmt)
        dining_session = ds_res.scalars().first()

        if dining_session:
            should_reassign_primary = False
            if dining_session.primary_waiter_id is None:
                should_reassign_primary = True
            else:
                old_pw_stmt = select(StaffUser).where(StaffUser.id == dining_session.primary_waiter_id)
                old_pw_res = await session.execute(old_pw_stmt)
                old_pw = old_pw_res.scalar_one_or_none()
                if not old_pw or not old_pw.is_online or old_pw.streak >= CFG_PRIMARY_MISS:
                    should_reassign_primary = True

            if should_reassign_primary:
                dining_session.primary_waiter_id = waiter_id

        await session.commit()
        return request
    except ValueError:
        raise
    except Exception:
        session.expire_on_rollback = False
        await session.rollback()
        raise


async def reject_waiter(session: AsyncSession, request_id: int, waiter_id: uuid.UUID, reason: str) -> ServiceRequest:
    """Waiter rejects request with reason -> immediate failover with zero delay (matching app.js reject(), line 87)."""
    try:
        now = _get_utc_now()

        att_stmt = (
            select(ServiceRequestAttempt)
            .where(
                ServiceRequestAttempt.request_id == request_id,
                ServiceRequestAttempt.waiter_id == waiter_id,
                ServiceRequestAttempt.status == AttemptStatus.WAITING,
            )
            .order_by(ServiceRequestAttempt.assigned_at.desc())
        )
        att_res = await session.execute(att_stmt)
        attempt = att_res.scalars().first()
        if not attempt:
            raise ValueError("No active waiting attempt found for this waiter")

        attempt.status = AttemptStatus.REJECTED
        attempt.rejection_reason = reason or "Other"
        attempt.responded_at = now

        # Update waiter rejection count
        w_stmt = select(StaffUser).where(StaffUser.id == waiter_id)
        w_res = await session.execute(w_stmt)
        waiter = w_res.scalar_one()
        waiter.rejected_count += 1

        await session.flush()

        # Immediate failover without waiting for countdown
        res = await next_waiter(session, request_id)
        await session.commit()
        return res
    except ValueError:
        raise
    except Exception:
        session.expire_on_rollback = False
        await session.rollback()
        raise


async def manager_assign(session: AsyncSession, alert_id: int, waiter_id: uuid.UUID) -> ServiceRequest:
    """Manager manually assigns any online waiter to a failed/escalated alert (matching app.js asg(), line 93).
    Has full authority to override previous rejections (Decision 2).
    """
    try:
        now = _get_utc_now()
        alert_stmt = select(ManagerAlert).where(ManagerAlert.id == alert_id)
        alert_res = await session.execute(alert_stmt)
        alert = alert_res.scalar_one_or_none()
        if not alert:
            raise ValueError(f"ManagerAlert #{alert_id} not found")

        alert.is_open = False
        alert.resolved_at = now
        alert.assigned_waiter_id = waiter_id
        await session.flush()

        res = await assign_waiter(session, alert.request_id, manager_waiter_id=waiter_id)
        await session.commit()
        return res
    except ValueError:
        raise
    except Exception:
        session.expire_on_rollback = False
        await session.rollback()
        raise


async def manager_resolve(session: AsyncSession, alert_id: int, resolver_id: Optional[uuid.UUID] = None) -> ManagerAlert:
    """Manager resolves alert without reassigning, cancelling request if failed (matching app.js resolve(), line 95)."""
    try:
        now = _get_utc_now()
        alert_stmt = select(ManagerAlert).where(ManagerAlert.id == alert_id)
        alert_res = await session.execute(alert_stmt)
        alert = alert_res.scalar_one_or_none()
        if not alert:
            raise ValueError(f"ManagerAlert #{alert_id} not found")

        alert.is_open = False
        alert.resolved_at = now
        alert.resolved_by = resolver_id

        # If request is FAILED, cancel it
        req_stmt = select(ServiceRequest).where(ServiceRequest.id == alert.request_id)
        req_res = await session.execute(req_stmt)
        request = req_res.scalar_one()
        if request.status == RequestStatus.FAILED:
            request.status = RequestStatus.CANCELLED

        await session.commit()
        return alert
    except ValueError:
        raise
    except Exception:
        session.expire_on_rollback = False
        await session.rollback()
        raise


async def offline_safeguard(
    session: AsyncSession, 
    waiter_id: uuid.UUID,
    is_online: Optional[bool] = None,
) -> List[int]:
    """Offline safeguard matching app.js toggle() (lines 88-92).
    - If going offline: cancels waiting attempts and reroutes; reroutes accepted requests.
    - If coming online: checks for open FAILED requests with NONE alerts and automatically retries them.
    """
    try:
        now = _get_utc_now()
        w_stmt = select(StaffUser).where(StaffUser.id == waiter_id)
        w_res = await session.execute(w_stmt)
        waiter = w_res.scalar_one_or_none()
        if not waiter:
            raise ValueError(f"StaffUser #{waiter_id} not found")

        if is_online is None:
            waiter.is_online = not waiter.is_online
        else:
            waiter.is_online = is_online

        re_routed_ids = []

        if not waiter.is_online:
            # Going offline:
            # 1. Any requests currently waiting with this waiter -> cancel attempt and advance
            waiting_stmt = (
                select(ServiceRequestAttempt)
                .where(
                    ServiceRequestAttempt.waiter_id == waiter_id,
                    ServiceRequestAttempt.status == AttemptStatus.WAITING,
                )
            )
            waiting_res = await session.execute(waiting_stmt)
            waiting_attempts = waiting_res.scalars().all()

            for att in waiting_attempts:
                try:
                    att.status = AttemptStatus.CANCELLED
                    att.responded_at = now
                    await session.flush()
                    await next_waiter(session, att.request_id)
                    await session.commit()
                    re_routed_ids.append(att.request_id)
                except ValueError:
                    raise
                except Exception:
                    session.expire_on_rollback = False
                    await session.rollback()
                    raise

            # 2. Any requests previously accepted by this waiter that are still open -> reset to PENDING and reassign
            accepted_stmt = (
                select(ServiceRequest)
                .where(
                    ServiceRequest.accepted_by == waiter_id,
                    ServiceRequest.status == RequestStatus.ACCEPTED,
                )
            )
            acc_res = await session.execute(accepted_stmt)
            accepted_requests = acc_res.scalars().all()

            for req in accepted_requests:
                try:
                    req.accepted_by = None
                    req.status = RequestStatus.PENDING
                    await session.flush()
                    await assign_waiter(session, req.id)
                    await session.commit()
                    re_routed_ids.append(req.id)
                except ValueError:
                    raise
                except Exception:
                    session.expire_on_rollback = False
                    await session.rollback()
                    raise

        else:
            # Coming online: (app.js line 91)
            # R.forEach(r => { if(r.status=="FAILED" && A.some(a => a.open && a.r==r.id && a.type=="NONE")) { r.at=[]; assign(r); } })
            failed_stmt = (
                select(ServiceRequest)
                .join(ManagerAlert, ManagerAlert.request_id == ServiceRequest.id)
                .where(
                    ServiceRequest.status == RequestStatus.FAILED,
                    ManagerAlert.is_open == True,
                    ManagerAlert.alert_type == ManagerAlertType.NONE,
                )
                .distinct()
            )
            failed_res = await session.execute(failed_stmt)
            failed_requests = failed_res.scalars().all()

            for req in failed_requests:
                try:
                    # Close open NONE alert
                    await session.execute(
                        update(ManagerAlert)
                        .where(ManagerAlert.request_id == req.id, ManagerAlert.is_open == True)
                        .values(is_open=False, resolved_at=now)
                    )
                    req.status = RequestStatus.PENDING
                    await session.flush()
                    await assign_waiter(session, req.id)
                    await session.commit()
                    re_routed_ids.append(req.id)
                except ValueError:
                    raise
                except Exception:
                    session.expire_on_rollback = False
                    await session.rollback()
                    raise

        await session.commit()
        return re_routed_ids
    except ValueError:
        raise
    except Exception:
        session.expire_on_rollback = False
        await session.rollback()
        raise


async def timeout_worker(session: AsyncSession) -> List[int]:
    """Background ticker checking expired attempts where status == WAITING and expires_at <= NOW().
    Handles delayed ticks gracefully by inspecting persisted deadlines (Requirement 5 & 6).
    Uses atomic conditional updates for concurrency safety and per-attempt rollback isolation.
    """
    now = _get_utc_now()
    stmt = (
        select(ServiceRequestAttempt)
        .where(
            ServiceRequestAttempt.status == AttemptStatus.WAITING,
        )
    )
    res = await session.execute(stmt)
    all_waiting = res.scalars().all()

    # Filter in Python with dialect-safe UTC comparison
    expired_attempts = [
        att for att in all_waiting 
        if _ensure_utc(att.expires_at) <= _ensure_utc(now)
    ]

    expired_ids = []
    for att in expired_attempts:
        try:
            # Atomic claim: update status to MISSED only if it is still WAITING
            claim_stmt = (
                update(ServiceRequestAttempt)
                .where(
                    ServiceRequestAttempt.id == att.id,
                    ServiceRequestAttempt.status == AttemptStatus.WAITING,
                )
                .values(
                    status=AttemptStatus.MISSED,
                    responded_at=now,
                )
            )
            claim_res = await session.execute(claim_stmt)
            if claim_res.rowcount == 0:
                continue  # Already claimed by concurrent worker execution

            expired_ids.append(att.id)

            # Update waiter missed stats and miss streak (app.js line 61: w.miss++; w.streak++;)
            w_stmt = select(StaffUser).where(StaffUser.id == att.waiter_id)
            w_res = await session.execute(w_stmt)
            waiter = w_res.scalar_one()
            waiter.missed_count += 1
            waiter.streak += 1
            await session.flush()

            # Advance request to next waiter
            await next_waiter(session, att.request_id)
            await session.commit()
        except ValueError:
            raise
        except Exception:
            session.expire_on_rollback = False
            await session.rollback()
            raise

    return expired_ids


async def auto_close_worker(session: AsyncSession) -> List[int]:
    """Background worker auto-closing accepted requests after 10 minutes (CFG_CLOSE_MS = 600000).
    Uses atomic conditional updates for concurrency safety.
    """
    try:
        now = _get_utc_now()
        cutoff = now - timedelta(milliseconds=CFG_CLOSE_MS)
        stmt = (
            select(ServiceRequest)
            .where(
                ServiceRequest.status == RequestStatus.ACCEPTED,
            )
        )
        res = await session.execute(stmt)
        all_accepted = res.scalars().all()

        stale_requests = [
            req for req in all_accepted 
            if req.accepted_at and _ensure_utc(req.accepted_at) <= _ensure_utc(cutoff)
        ]

        closed_ids = []
        for req in stale_requests:
            claim_stmt = (
                update(ServiceRequest)
                .where(
                    ServiceRequest.id == req.id,
                    ServiceRequest.status == RequestStatus.ACCEPTED,
                )
                .values(
                    status=RequestStatus.CLOSED,
                    closed_at=now,
                )
            )
            claim_res = await session.execute(claim_stmt)
            if claim_res.rowcount > 0:
                closed_ids.append(req.id)

        if closed_ids:
            await session.commit()
        return closed_ids
    except ValueError:
        raise
    except Exception:
        session.expire_on_rollback = False
        await session.rollback()
        raise


async def create_service_request(
    session: AsyncSession,
    table_id: int,
    service_key: str,
    details: str = "",
) -> ServiceRequest:
    """Create a new service request with duplicate suppression and trigger assignment (app.js req(), line 72).
    Concurrency-safe across simultaneous sessions with keyed locking and row-level locking.
    """
    session.expire_on_rollback = False
    clean_details = (details or "").strip()
    lock_key = (table_id, service_key, clean_details if service_key == "custom" else "")
    lock = await _acquire_creation_lock(lock_key)

    async with lock:
        try:
            now = _get_utc_now()

            # Optional table lock for dialect safety (PostgreSQL acquires row lock; SQLite safely ignores)
            table_stmt = (
                select(RestaurantTable)
                .where(RestaurantTable.id == table_id)
                .with_for_update()
            )
            table_res = await session.execute(table_stmt)
            table = table_res.scalar_one_or_none()
            if not table:
                raise ValueError(f"Table #{table_id} not found")

            # Duplicate check (app.js line 73):
            # Same table + same service_key + (if custom: same details)
            # Active if PENDING, ASSIGNED, ESCALATED, FAILED, or ACCEPTED within CFG_DUP_ACCEPT_MS (60s)
            cutoff = now - timedelta(milliseconds=CFG_DUP_ACCEPT_MS)

            active_stmt = select(ServiceRequest).where(
                ServiceRequest.table_id == table_id,
                ServiceRequest.service_key == service_key,
            )
            if service_key == "custom":
                active_stmt = active_stmt.where(ServiceRequest.details == clean_details)

            active_res = await session.execute(active_stmt)
            existing_requests = active_res.scalars().all()

            for r in existing_requests:
                if r.status in [RequestStatus.PENDING, RequestStatus.ASSIGNED, RequestStatus.ESCALATED, RequestStatus.FAILED]:
                    raise ValueError("This request has already been sent.")
                if r.status == RequestStatus.ACCEPTED and r.accepted_at and _ensure_utc(r.accepted_at) >= _ensure_utc(cutoff):
                    raise ValueError("This request has already been sent.")

            # Find or create active DiningSession for table
            ds_stmt = (
                select(DiningSession)
                .where(DiningSession.table_id == table_id, DiningSession.status == SessionStatus.ACTIVE)
                .order_by(DiningSession.opened_at.desc())
            )
            ds_res = await session.execute(ds_stmt)
            dining_session = ds_res.scalars().first()
            if not dining_session:
                dining_session = DiningSession(
                    table_id=table_id,
                    session_token=f"session_t{table_id}_{uuid.uuid4().hex[:12]}",
                    status=SessionStatus.ACTIVE,
                    opened_at=now,
                )
                session.add(dining_session)
                await session.flush()

            request = ServiceRequest(
                session_id=dining_session.id,
                table_id=table_id,
                service_key=service_key,
                details=clean_details,
                status=RequestStatus.PENDING,
                created_at=now,
            )
            session.add(request)
            # Keep request creation and initial assignment within the same transaction
            # so a failed assignment cannot leave an orphaned, half-created request.
            await session.flush()

            # Trigger initial assignment
            return await assign_waiter(session, request.id)
        except ValueError:
            raise
        except Exception:
            session.expire_on_rollback = False
            await session.rollback()
            raise


async def resend_service_request(session: AsyncSession, request_id: int) -> ServiceRequest:
    """Customer presses Resend / Not received yet (matching app.js resend(), line 77).
    Enforces 60s cooldown, max 3 resends, resets attempts, and re-routes.
    """
    try:
        now = _get_utc_now()
        stmt = select(ServiceRequest).where(ServiceRequest.id == request_id).with_for_update()
        res = await session.execute(stmt)
        request = res.scalar_one_or_none()
        if not request:
            raise ValueError(f"ServiceRequest #{request_id} not found")

        # Resend limit check (app.js line 78)
        if request.resend_count >= CFG_RESEND_MAX:
            await fail_request(session, request, ManagerAlertType.LIMIT)
            await session.commit()
            raise ValueError("Resend limit reached. The manager has been informed.")

        # Check if currently waiting with a waiter (app.js line 78: if(r.cur) return toast(...))
        att_stmt = select(ServiceRequestAttempt).where(ServiceRequestAttempt.request_id == request_id)
        att_res = await session.execute(att_stmt)
        all_attempts = att_res.scalars().all()

        waiting_att = next(
            (a for a in all_attempts 
             if (a.attempt_number // 10) == request.resend_count 
             and a.status == AttemptStatus.WAITING), 
            None
        )
        if waiting_att and _ensure_utc(now) < _ensure_utc(waiting_att.expires_at):
            raise ValueError("The request is currently with a waiter.")

        # Check 60s cooldown (app.js line 62: S.t - r.last >= CFG.RESEND)
        last_activity = _ensure_utc(request.accepted_at or request.created_at)
        if (_ensure_utc(now) - last_activity).total_seconds() < (CFG_RESEND_MS / 1000):
            remaining = int((CFG_RESEND_MS / 1000) - (_ensure_utc(now) - last_activity).total_seconds())
            raise ValueError(f"Resend cooldown active. Please wait {remaining} more seconds.")

        request.resend_count += 1

        # If previously accepted, clear accepted_by
        if request.status == RequestStatus.ACCEPTED:
            request.accepted_by = None

        # Close any open manager alerts
        await session.execute(
            update(ManagerAlert)
            .where(ManagerAlert.request_id == request.id, ManagerAlert.is_open == True)
            .values(is_open=False, resolved_at=now)
        )

        request.status = RequestStatus.PENDING
        await session.commit()

        # Trigger re-assignment
        return await assign_waiter(session, request.id)
    except ValueError:
        raise
    except Exception:
        session.expire_on_rollback = False
        await session.rollback()
        raise


async def cancel_service_request(
    session: AsyncSession,
    request_id: int,
    table_id: Optional[int] = None,
) -> ServiceRequest:
    """Customer cancels an open service request.

    Cancel is allowed only while the request is pending, assigned, escalated,
    or failed. Accepted, completed, or already-cancelled requests are not
    silently changed. Open manager alerts and waiting attempts are closed with
    the cancellation so the manager and waiter views stay consistent.
    """
    session.expire_on_rollback = False
    try:
        now = _get_utc_now()

        stmt = select(ServiceRequest).where(ServiceRequest.id == request_id)
        res = await session.execute(stmt)
        request = res.scalar_one_or_none()
        if not request:
            raise ValueError(f"ServiceRequest #{request_id} not found")

        if table_id is not None and request.table_id != table_id:
            raise ValueError("Request was not found for this table.")

        current_status = request.status
        if current_status == RequestStatus.CANCELLED:
            return request

        if current_status in (RequestStatus.ACCEPTED, RequestStatus.CLOSED):
            raise ValueError("Accepted or completed requests cannot be cancelled.")

        cancelable_statuses = {
            RequestStatus.PENDING,
            RequestStatus.ASSIGNED,
            RequestStatus.ESCALATED,
            RequestStatus.FAILED,
        }
        if current_status not in cancelable_statuses:
            raise ValueError("This request cannot be cancelled.")

        # Close open manager alerts for the request.
        await session.execute(
            update(ManagerAlert)
            .where(ManagerAlert.request_id == request_id, ManagerAlert.is_open == True)
            .values(is_open=False, resolved_at=now)
        )

        # Mark any active waiting attempts as cancelled.
        await session.execute(
            update(ServiceRequestAttempt)
            .where(
                ServiceRequestAttempt.request_id == request_id,
                ServiceRequestAttempt.status == AttemptStatus.WAITING,
            )
            .values(status=AttemptStatus.CANCELLED, responded_at=now)
        )

        # Conditional cancellation prevents racing slower actions.
        update_res = await session.execute(
            update(ServiceRequest)
            .where(
                ServiceRequest.id == request_id,
                ServiceRequest.status.in_(tuple(cancelable_statuses)),
            )
            .values(
                status=RequestStatus.CANCELLED,
                accepted_by=None,
                closed_at=now,
            )
        )
        if update_res.rowcount == 0:
            refreshed_stmt = select(ServiceRequest).where(ServiceRequest.id == request_id)
            refreshed_res = await session.execute(refreshed_stmt)
            refreshed = refreshed_res.scalar_one()
            if refreshed.status == RequestStatus.CANCELLED:
                return refreshed
            if refreshed.status in (RequestStatus.ACCEPTED, RequestStatus.CLOSED):
                raise ValueError("Accepted or completed requests cannot be cancelled.")
            raise ValueError("This request cannot be cancelled.")

        refreshed_stmt = select(ServiceRequest).where(ServiceRequest.id == request_id)
        refreshed_res = await session.execute(refreshed_stmt)
        request = refreshed_res.scalar_one()
        await session.commit()
        return request
    except ValueError:
        raise
    except Exception:
        session.expire_on_rollback = False
        await session.rollback()
        raise
