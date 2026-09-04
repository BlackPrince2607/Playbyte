from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.auth import Actor
from app.common.errors import AppError
from app.config import get_settings
from app.infrastructure.postgres.models import (
    CrowdSnapshot,
    GuestSession,
    Moment,
    Response,
    UserDailyStat,
)
from app.infrastructure.queue.outbox import enqueue
from app.modules.crowd.volume import volume_state
from app.modules.feed.service import my_response, serialize_snapshot


async def submit_response(
    session: AsyncSession,
    actor: Actor,
    moment_id: UUID,
    option_id: UUID,
    idempotency_key: str | None,
) -> dict:
    moment = await session.get(Moment, moment_id, options=[selectinload(Moment.options)])
    if moment is None:
        raise AppError("not_found", "Moment not found.", 404)
    now = datetime.now(UTC)
    if moment.status != "live":
        raise AppError("moment_closed", "This moment is not live.", 409)
    if moment.starts_at and moment.starts_at > now:
        raise AppError("moment_closed", "This moment is not open yet.", 409)
    if moment.ends_at and moment.ends_at <= now:
        raise AppError("moment_closed", "This moment has closed.", 409)
    option = next((o for o in moment.options if o.id == option_id), None)
    if option is None:
        raise AppError("invalid_option", "Option does not belong to this moment.", 422)

    existing = await my_response(session, moment_id, actor.user_id, actor.guest_id)
    if existing:
        snap = await session.get(CrowdSnapshot, moment_id)
        return _result_payload(actor, existing, snap, created=False)

    if idempotency_key:
        stmt = select(Response).where(Response.moment_id == moment_id, Response.idempotency_key == idempotency_key)
        if actor.user_id:
            stmt = stmt.where(Response.user_id == actor.user_id)
        else:
            stmt = stmt.where(Response.guest_session_id == actor.guest_id)
        dup = await session.scalar(stmt)
        if dup:
            snap = await session.get(CrowdSnapshot, moment_id)
            return _result_payload(actor, dup, snap, created=False)

    row = Response(
        moment_id=moment_id,
        option_id=option_id,
        user_id=actor.user_id,
        guest_session_id=actor.guest_id,
        idempotency_key=idempotency_key,
    )
    session.add(row)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        existing = await my_response(session, moment_id, actor.user_id, actor.guest_id)
        if existing is None:
            raise AppError("conflict", "Could not record response.", 409) from None
        snap = await session.get(CrowdSnapshot, moment_id)
        return _result_payload(actor, existing, snap, created=False)
    await enqueue(
        session,
        "response.created",
        {"momentId": str(moment_id), "optionId": str(option_id)},
    )
    if actor.guest_id:
        guest = await session.get(GuestSession, actor.guest_id)
        if guest:
            guest.moments_responded_count += 1
            actor.engagements = guest.moments_responded_count + guest.games_played_count
    if actor.user_id:
        await _bump_daily(session, actor.user_id, moments=1)
    await session.flush()
    snap = await _optimistic_snapshot(session, moment_id, option_id)
    return _result_payload(actor, row, snap, created=True)


def _result_payload(actor: Actor, response: Response, snap: CrowdSnapshot | None, created: bool) -> dict:
    settings = get_settings()
    prompt = actor.kind == "guest" and actor.engagements >= settings.account_prompt_after
    return {
        "responseId": str(response.id),
        "optionId": str(response.option_id),
        "created": created,
        "promptAccountCreation": prompt,
        "result": serialize_snapshot(response.moment_id, snap),
    }


async def _optimistic_snapshot(session: AsyncSession, moment_id: UUID, option_id: UUID) -> CrowdSnapshot:
    snap = await session.get(CrowdSnapshot, moment_id)
    if snap is None:
        snap = CrowdSnapshot(moment_id=moment_id, version=0, total_responses=0, option_counts={})
        session.add(snap)
        await session.flush()
    counts = dict(snap.option_counts or {})
    key = str(option_id)
    counts[key] = int(counts.get(key, 0)) + 1
    snap.option_counts = counts
    snap.total_responses = int(snap.total_responses or 0) + 1
    snap.version = int(snap.version or 0) + 1
    snap.volume_state = volume_state(snap.total_responses)
    snap.generated_at = datetime.now(UTC)
    return snap


async def rebuild_snapshot(session: AsyncSession, moment_id: UUID) -> CrowdSnapshot:
    total = await session.scalar(select(func.count()).select_from(Response).where(Response.moment_id == moment_id))
    rows = await session.execute(
        select(Response.option_id, func.count()).where(Response.moment_id == moment_id).group_by(Response.option_id)
    )
    counts = {str(oid): int(c) for oid, c in rows.all()}
    minute_ago = datetime.now(UTC) - timedelta(minutes=1)
    last_min = await session.scalar(
        select(func.count())
        .select_from(Response)
        .where(Response.moment_id == moment_id, Response.created_at >= minute_ago)
    )
    snap = await session.get(CrowdSnapshot, moment_id)
    if snap is None:
        snap = CrowdSnapshot(moment_id=moment_id)
        session.add(snap)
    snap.total_responses = int(total or 0)
    snap.option_counts = counts
    snap.joined_last_minute = int(last_min or 0)
    snap.version = int(snap.version or 0) + 1
    snap.volume_state = volume_state(snap.total_responses)
    snap.generated_at = datetime.now(UTC)
    return snap


async def _bump_daily(session: AsyncSession, user_id: UUID, moments: int = 0, games: int = 0) -> None:
    today = datetime.now(UTC).date()
    row = await session.get(UserDailyStat, (user_id, today))
    if row is None:
        row = UserDailyStat(user_id=user_id, date=today)
        session.add(row)
    row.moments_joined += moments
    row.games_played += games
