"""Friends and global leaderboards built from real activity in ``user_daily_stats``.

Every answered moment and every finished mini-game is worth ``POINTS_PER_ACTION``. Players whose default
visibility is ``private`` (and deleted or disabled accounts) never appear on anyone else's board.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors import AppError
from app.infrastructure.postgres.models import Friendship, Profile, User, UserDailyStat

POINTS_PER_ACTION = 10
SCOPES = ("friends", "global")
PERIODS = ("week", "all")
WEEK_DAYS = 7
MAX_LIMIT = 100


def period_start(period: str, today: date | None = None) -> date | None:
    if period == "week":
        return (today or datetime.now(UTC).date()) - timedelta(days=WEEK_DAYS - 1)
    return None


def rank_rows(points: list[int]) -> list[int]:
    """Standard competition ranks (1, 2, 2, 4) for points already sorted high to low."""
    ranks: list[int] = []
    for i, p in enumerate(points):
        ranks.append(ranks[-1] if i and p == points[i - 1] else i + 1)
    return ranks


def _points_by_user(start: date | None) -> Select:
    actions = func.sum(UserDailyStat.moments_joined + UserDailyStat.games_played)
    q = select(UserDailyStat.user_id.label("user_id"), (actions * POINTS_PER_ACTION).label("points")).group_by(
        UserDailyStat.user_id
    )
    if start is not None:
        q = q.where(UserDailyStat.date >= start)
    return q


def _visible():
    return [User.status == "active", or_(Profile.user_id.is_(None), Profile.default_visibility != "private")]


def _entry(rank: int | None, user_id: UUID, profile: Profile | None, points: int, viewer: UUID | None) -> dict:
    return {
        "rank": rank,
        "userId": str(user_id),
        "displayName": profile.display_name if profile else "Player",
        "avatarKey": profile.avatar_key if profile else None,
        "points": int(points),
        "isYou": user_id == viewer,
    }


async def _viewer_points(session: AsyncSession, viewer: UUID, start: date | None) -> int:
    pts = _points_by_user(start).where(UserDailyStat.user_id == viewer).subquery()
    return int(await session.scalar(select(func.coalesce(func.max(pts.c.points), 0))) or 0)


async def global_board(session: AsyncSession, viewer: UUID | None, period: str, limit: int) -> dict:
    start = period_start(period)
    pts = _points_by_user(start).subquery()
    eligible = (
        select(pts.c.user_id, pts.c.points, Profile)
        .join(User, User.id == pts.c.user_id)
        .outerjoin(Profile, Profile.user_id == pts.c.user_id)
        .where(pts.c.points > 0, *_visible())
    )
    rows = (await session.execute(eligible.order_by(pts.c.points.desc(), pts.c.user_id).limit(limit))).all()
    ranks = rank_rows([int(r.points) for r in rows])
    entries = [_entry(rank, r.user_id, r.Profile, r.points, viewer) for rank, r in zip(ranks, rows, strict=True)]

    you = None
    if viewer is not None:
        mine = next((e for e in entries if e["isYou"]), None)
        if mine is not None:
            you = mine
        else:
            points = await _viewer_points(session, viewer, start)
            profile = await session.get(Profile, viewer)
            hidden = profile is not None and profile.default_visibility == "private"
            rank = None
            if points > 0 and not hidden:
                above = eligible.where(pts.c.points > points).subquery()
                rank = 1 + int(await session.scalar(select(func.count()).select_from(above)) or 0)
            you = {**_entry(rank, viewer, profile, points, viewer), "hidden": hidden}
    return {"entries": entries, "you": you}


async def friends_board(session: AsyncSession, viewer: UUID, period: str) -> dict:
    start = period_start(period)
    friendships = await session.scalars(
        select(Friendship).where(
            Friendship.status == "accepted", or_(Friendship.user_a == viewer, Friendship.user_b == viewer)
        )
    )
    friend_ids = {f.user_b if f.user_a == viewer else f.user_a for f in friendships}
    people = (
        await session.execute(
            select(User.id, Profile)
            .outerjoin(Profile, Profile.user_id == User.id)
            .where(User.id.in_(friend_ids), *_visible())
        )
    ).all()
    members: dict[UUID, Profile | None] = {row.id: row.Profile for row in people}
    members[viewer] = await session.get(Profile, viewer)

    pts = _points_by_user(start).where(UserDailyStat.user_id.in_(members.keys())).subquery()
    points = {row.user_id: int(row.points) for row in (await session.execute(select(pts))).all()}

    def sort_key(uid: UUID) -> tuple:
        p = members[uid]
        return (-points.get(uid, 0), (p.display_name if p else "Player").lower(), str(uid))

    ordered = sorted(members, key=sort_key)
    ranks = rank_rows([points.get(uid, 0) for uid in ordered])
    entries = [
        _entry(rank, uid, members[uid], points.get(uid, 0), viewer) for rank, uid in zip(ranks, ordered, strict=True)
    ]
    return {"entries": entries, "you": next(e for e in entries if e["isYou"])}


async def leaderboard(
    session: AsyncSession, *, scope: str, period: str, viewer: UUID | None, limit: int = 50
) -> dict:
    if scope not in SCOPES:
        raise AppError("invalid", f"scope must be one of {', '.join(SCOPES)}.", 400)
    if period not in PERIODS:
        raise AppError("invalid", f"period must be one of {', '.join(PERIODS)}.", 400)
    if scope == "friends":
        if viewer is None:
            raise AppError("unauthorized", "Sign in to see your friends board.", 401)
        board = await friends_board(session, viewer, period)
    else:
        board = await global_board(session, viewer, period, max(1, min(limit, MAX_LIMIT)))
    return {"scope": scope, "period": period, "pointsPerAction": POINTS_PER_ACTION, **board}
