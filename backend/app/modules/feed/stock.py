"""Keep a minimum of live cards for the categories a viewer picked until the next refresh."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.postgres.models import Category, Moment
from app.modules.cms.service import create_moment, transition_moment
from scripts.content_gen.agent import localize_hi
from scripts.content_gen.catalog import MIN_LIVE, generate_stock

# Interest fill is a bridge until the scheduled refresh replaces the feed.
STOCK_TTL_HOURS = 4


async def ensure_category_stock(
    session: AsyncSession,
    category_ids: list[UUID],
    actor_id: UUID | None,
) -> int:
    """Publish catalog cards until each selected category has MIN_LIVE live moments.

    Uses the category banks, not the model, so saving interests does not call OpenAI.
    Cards expire so the next refresh can retire them with the rest of the feed.
    """
    if not category_ids:
        return 0
    now = datetime.now(UTC)
    stock_ends = now + timedelta(hours=STOCK_TTL_HOURS)
    created = 0
    cats = list(await session.scalars(select(Category).where(Category.id.in_(category_ids))))
    for cat in cats:
        live = await session.scalar(
            select(func.count())
            .select_from(Moment)
            .where(
                Moment.category_id == cat.id,
                Moment.status == "live",
                or_(Moment.ends_at.is_(None), Moment.ends_at > now),
            )
        )
        deficit = MIN_LIVE - int(live or 0)
        if deficit <= 0:
            continue
        existing = set(await session.scalars(select(Moment.prompt).where(Moment.category_id == cat.id)))
        cards = localize_hi([card for card in generate_stock(cat.slug) if card.prompt not in existing][:deficit])
        for card in cards:
            row = await create_moment(
                session,
                actor_id=actor_id,
                moment_type=card.type,
                category_id=cat.id,
                prompt=card.prompt,
                options=card.options,
                starts_at=now,
                ends_at=card.ends_at or stock_ends,
                scoring_mode=card.scoring_mode,
                tag_slugs=list(card.tags),
                prompt_hi=card.prompt_hi,
            )
            await transition_moment(session, row.id, "ready", actor_id)
            await transition_moment(session, row.id, "live", actor_id)
            created += 1
    return created
