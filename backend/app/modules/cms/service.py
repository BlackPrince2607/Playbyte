from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.errors import AppError
from app.infrastructure.postgres.models import AuditLog, Moment, MomentApproval, MomentOption
from app.modules.moments.state import can_go_live, can_transition


async def create_moment(
    session: AsyncSession,
    *,
    actor_id: UUID | None,
    moment_type: str,
    category_id: UUID,
    prompt: str,
    options: list[str],
    restricted_topic: str = "none",
    content_window_id: UUID | None = None,
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
) -> Moment:
    if moment_type == "predict" and len(options) != 2:
        raise AppError("invalid", "Predict cards need exactly 2 options.", 422)
    if moment_type == "pulse" and not (2 <= len(options) <= 4):
        raise AppError("invalid", "Pulse cards need 2–4 options.", 422)
    if moment_type == "reaction" and len(options) != 2:
        raise AppError("invalid", "Reaction cards need exactly 2 options.", 422)
    lowered = " ".join(options).lower() + " " + prompt.lower()
    if any(w in lowered for w in ("odds", "payout", "bet", "stake", "wager")):
        raise AppError("invalid", "Prediction copy cannot use gambling language.", 422)
    m = Moment(
        type=moment_type,
        category_id=category_id,
        prompt=prompt,
        restricted_topic=restricted_topic,
        content_window_id=content_window_id,
        starts_at=starts_at,
        ends_at=ends_at,
        status="draft",
        created_by=actor_id,
    )
    session.add(m)
    await session.flush()
    for i, label in enumerate(options):
        session.add(MomentOption(moment_id=m.id, label=label, sort_order=i))
    session.add(AuditLog(actor_id=actor_id, action="moment.create", resource="moment", resource_id=str(m.id)))
    await session.flush()
    return m


async def transition_moment(
    session: AsyncSession,
    moment_id: UUID,
    target: str,
    actor_id: UUID | None,
) -> Moment:
    m = await session.get(Moment, moment_id, options=[selectinload(Moment.options)])
    if m is None:
        raise AppError("not_found", "Moment not found.", 404)
    if not can_transition(m.status, target):
        raise AppError("invalid_state", f"Cannot move from {m.status} to {target}.", 409)
    if target == "live":
        approvals = list(await session.scalars(select(MomentApproval).where(MomentApproval.moment_id == m.id)))
        ok, reason = can_go_live(
            restricted_topic=m.restricted_topic,
            distinct_approver_ids={a.approver_id for a in approvals if a.decision == "approve"},
            now=datetime.now(UTC),
            starts_at=m.starts_at,
            ends_at=m.ends_at,
        )
        if not ok:
            raise AppError("forbidden", reason, 409)
        if m.starts_at is None:
            m.starts_at = datetime.now(UTC)
    m.status = target
    m.updated_at = datetime.now(UTC)
    session.add(AuditLog(actor_id=actor_id, action=f"moment.{target}", resource="moment", resource_id=str(m.id)))
    return m


async def approve_moment(session: AsyncSession, moment_id: UUID, approver_id: UUID, decision: str) -> None:
    if approver_id is None:
        raise AppError("invalid", "Approver identity required for restricted topics.", 422)
    session.add(MomentApproval(moment_id=moment_id, approver_id=approver_id, decision=decision))
    session.add(AuditLog(actor_id=approver_id, action="moment.approve", resource="moment", resource_id=str(moment_id)))
