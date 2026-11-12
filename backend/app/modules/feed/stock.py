"""Keep a minimum of live cards for the categories a viewer picked until the next refresh."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.postgres.models import Category, Moment
from app.modules.cms.service import create_moment, transition_moment
from scripts.content_gen.catalog import MIN_LIVE, generate_stock


async def revive_expired_live_moments(session: AsyncSession) -> int:
    """Clear ends_at on still-live cards past their window.

    A missed/late refresh used to leave status=live rows invisible to the feed (ends_at filter),
    which collapsed the swipe list to games-only. Keep them servable until the next publish retires them.
    """
    now = datetime.now(UTC)
    result = await session.execute(
        update(Moment)
        .where(
            Moment.status == "live",
            Moment.ends_at.is_not(None),
            Moment.ends_at <= now,
        )
        .values(ends_at=None, updated_at=now)
    )
    return int(result.rowcount or 0)


async def ensure_category_stock(
    session: AsyncSession,
    category_ids: list[UUID],
    actor_id: UUID | None,
) -> int:
    """Publish catalog cards until each selected category has MIN_LIVE live English moments.

    Uses the English category banks only (content_lang=en). No OpenAI and no Hindi localization —
    Hindi stock comes from the Hindi generation agent on refresh. Counting is per content_lang
    so English evergreen never fake-fills the Hindi pool.
    """
    if not category_ids:
        return 0
    now = datetime.now(UTC)
    created = 0
    cats = list(await session.scalars(select(Category).where(Category.id.in_(category_ids))))
    for cat in cats:
        live = await session.scalar(
            select(func.count())
            .select_from(Moment)
            .where(
                Moment.category_id == cat.id,
                Moment.status == "live",
                Moment.content_lang == "en",
                or_(Moment.ends_at.is_(None), Moment.ends_at > now),
            )
        )
        deficit = MIN_LIVE - int(live or 0)
        if deficit <= 0:
            continue
        existing = set(
            await session.scalars(
                select(Moment.prompt).where(
                    Moment.category_id == cat.id,
                    Moment.content_lang == "en",
                )
            )
        )
        cards = [card for card in generate_stock(cat.slug) if card.prompt not in existing][:deficit]
        for card in cards:
            # Strip any accidental Hindi fields from bank cards — EN pool stays English-only.
            options = [
                {
                    "label": str(opt.get("label") or ""),
                    "isCorrect": bool(opt.get("isCorrect")),
                }
                for opt in card.options
            ]
            row = await create_moment(
                session,
                actor_id=actor_id,
                moment_type=card.type,
                category_id=cat.id,
                prompt=card.prompt,
                options=options,
                starts_at=now,
                ends_at=card.ends_at,
                scoring_mode=card.scoring_mode,
                tag_slugs=list(card.tags),
                prompt_hi=None,
                content_lang="en",
            )
            await transition_moment(session, row.id, "ready", actor_id)
            await transition_moment(session, row.id, "live", actor_id)
            created += 1
    return created


async def ensure_feed_has_moments(session: AsyncSession, actor_id: UUID | None = None) -> int:
    """If the live feed pool is empty, revive expired live cards, then top up from the catalog."""
    now = datetime.now(UTC)
    open_count = await session.scalar(
        select(func.count())
        .select_from(Moment)
        .where(
            Moment.status == "live",
            or_(Moment.ends_at.is_(None), Moment.ends_at > now),
        )
    )
    if int(open_count or 0) > 0:
        return 0
    revived = await revive_expired_live_moments(session)
    open_after = await session.scalar(
        select(func.count())
        .select_from(Moment)
        .where(
            Moment.status == "live",
            or_(Moment.ends_at.is_(None), Moment.ends_at > now),
        )
    )
    if int(open_after or 0) > 0:
        return revived
    category_ids = list(await session.scalars(select(Category.id)))
    return revived + await ensure_category_stock(session, category_ids, actor_id)
