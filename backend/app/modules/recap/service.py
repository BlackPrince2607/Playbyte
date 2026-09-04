from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.postgres.models import UserDailyStat


async def weekly_recap(session: AsyncSession, user_id: UUID) -> dict:
    today = datetime.now(UTC).date()
    start = today - timedelta(days=6)
    rows = list(
        await session.scalars(
            select(UserDailyStat).where(UserDailyStat.user_id == user_id, UserDailyStat.date >= start)
        )
    )
    moments = sum(r.moments_joined for r in rows)
    games = sum(r.games_played for r in rows)
    matches = sum(r.majority_matches for r in rows)
    unique_people = max((r.unique_people for r in rows), default=0)
    active_days = sum(1 for r in rows if r.moments_joined + r.games_played > 0)
    rate = 0.0 if moments == 0 else round(100.0 * matches / moments, 1)
    badges: list[str] = []
    if active_days >= 3:
        badges.append("showed-up")
    if moments + games >= 10:
        badges.append("in-the-crowd")
    return {
        "periodStart": start.isoformat(),
        "periodEnd": today.isoformat(),
        "momentsJoined": moments,
        "gamesPlayed": games,
        "majorityMatchPercent": rate,
        "activeDays": active_days,
        "uniquePeopleAlongside": unique_people,
        "badges": badges,
    }
