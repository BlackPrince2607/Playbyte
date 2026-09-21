from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.errors import AppError
from app.infrastructure.postgres.models import (
    AuditLog,
    ContentTag,
    Moment,
    MomentApproval,
    MomentOption,
    MomentTag,
)


async def create_moment(
    session: AsyncSession,
    *,
    actor_id: UUID | None,
    moment_type: str,
    category_id: UUID,
    prompt: str,
    options: list[dict | str],
    restricted_topic: str = "none",
    content_window_id: UUID | None = None,
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
    prompt_image_key: str | None = None,
    scoring_mode: str = "none",
    tag_slugs: list[str] | None = None,
) -> Moment:
    normalized: list[dict] = []
    for i, opt in enumerate(options):
        if isinstance(opt, str):
            normalized.append({"label": opt, "imageKey": None, "isCorrect": False, "sortOrder": i})
        else:
            normalized.append(
                {
                    "label": opt.get("label") or opt.get("text"),
                    "imageKey": opt.get("imageKey") or opt.get("image_key"),
                    "isCorrect": bool(opt.get("isCorrect") or opt.get("is_correct")),
                    "sortOrder": opt.get("sortOrder", i),
                }
            )

    if moment_type == "predict" and len(normalized) != 2:
        raise AppError("invalid", "Predict cards need exactly 2 options.", 422)
    if moment_type == "pulse" and not (2 <= len(normalized) <= 4):
        raise AppError("invalid", "Pulse cards need 2–4 options.", 422)
    if moment_type == "reaction" and len(normalized) != 2:
        raise AppError("invalid", "Reaction cards need exactly 2 options.", 422)

    for opt in normalized:
        label = (opt.get("label") or "").strip()
        image_key = opt.get("imageKey")
        if not label and not image_key:
            raise AppError("invalid", "Each option needs text and/or an image.", 422)
        opt["label"] = label or None

    tags = tag_slugs or []
    is_quiz = "quiz" in tags or scoring_mode == "correct_option"
    if is_quiz:
        scoring_mode = "correct_option"
        correct_count = sum(1 for o in normalized if o.get("isCorrect"))
        if correct_count != 1:
            raise AppError("invalid", "Quiz moments need exactly one correct option.", 422)
        if "quiz" not in tags:
            tags = [*tags, "quiz"]
    else:
        scoring_mode = "none"
        for o in normalized:
            o["isCorrect"] = False
        if "poll" not in tags and "quiz" not in tags:
            tags = [*tags, "poll"]

    lowered = " ".join((o.get("label") or "") for o in normalized).lower() + " " + prompt.lower()
    if any(w in lowered for w in ("odds", "payout", "bet", "stake", "wager")):
        raise AppError("invalid", "Prediction copy cannot use gambling language.", 422)

    m = Moment(
        type=moment_type,
        category_id=category_id,
        prompt=prompt,
        prompt_image_key=prompt_image_key,
        scoring_mode=scoring_mode,
        restricted_topic=restricted_topic,
        content_window_id=content_window_id,
        starts_at=starts_at,
        ends_at=ends_at,
        status="draft",
        created_by=actor_id,
    )
    session.add(m)
    await session.flush()
    for opt in normalized:
        session.add(
            MomentOption(
                moment_id=m.id,
                label=opt["label"],
                image_key=opt.get("imageKey"),
                is_correct=bool(opt.get("isCorrect")),
                sort_order=int(opt["sortOrder"]),
            )
        )

    if tags:
        tag_rows = list(await session.scalars(select(ContentTag).where(ContentTag.slug.in_(tags))))
        found = {t.slug: t for t in tag_rows}
        missing = [s for s in tags if s not in found]
        if missing:
            raise AppError("invalid", f"Unknown content tags: {', '.join(missing)}", 422)
        for slug in tags:
            session.add(MomentTag(moment_id=m.id, tag_id=found[slug].id))

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
    from app.modules.moments.state import can_go_live, can_transition

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
