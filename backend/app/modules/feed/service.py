from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.infrastructure.postgres.models import (
    ContentWindow,
    CrowdSnapshot,
    Friendship,
    GuestInterest,
    MiniGame,
    Moment,
    Profile,
    Response,
    ResponseVisibility,
    UserInterest,
)
from app.modules.crowd.volume import volume_state
from app.modules.feed.ranking import RankedItem, interleave, moment_score


async def interest_ids(session: AsyncSession, user_id: UUID | None, guest_id: UUID | None) -> set[UUID]:
    if user_id:
        rows = await session.scalars(select(UserInterest.category_id).where(UserInterest.user_id == user_id))
        return set(rows)
    if guest_id:
        rows = await session.scalars(
            select(GuestInterest.category_id).where(GuestInterest.guest_session_id == guest_id)
        )
        return set(rows)
    return set()


async def load_live_moments(session: AsyncSession) -> list[Moment]:
    now = datetime.now(UTC)
    stmt = (
        select(Moment)
        .options(selectinload(Moment.options), selectinload(Moment.category))
        .where(Moment.status == "live")
        .where(or_(Moment.starts_at.is_(None), Moment.starts_at <= now))
        .where(or_(Moment.ends_at.is_(None), Moment.ends_at > now))
    )
    return list(await session.scalars(stmt))


async def active_window_ids(session: AsyncSession) -> set[UUID]:
    now = datetime.now(UTC)
    rows = await session.scalars(
        select(ContentWindow.id).where(
            ContentWindow.status == "active",
            ContentWindow.starts_at <= now,
            ContentWindow.ends_at > now,
        )
    )
    return set(rows)


async def build_feed(
    session: AsyncSession,
    *,
    user_id: UUID | None,
    guest_id: UUID | None,
    limit: int = 10,
) -> list[dict]:
    interests = await interest_ids(session, user_id, guest_id)
    windows = await active_window_ids(session)
    moments = await load_live_moments(session)
    now = datetime.now(UTC)
    ranked_moments: list[RankedItem] = []
    by_id = {m.id: m for m in moments}
    for m in moments:
        ranked_moments.append(
            RankedItem(
                kind="moment",
                id=str(m.id),
                score=moment_score(
                    now=now,
                    starts_at=m.starts_at,
                    in_active_window=m.content_window_id in windows if m.content_window_id else False,
                    interest_match=m.category_id in interests,
                ),
            )
        )
    ranked_moments.sort(key=lambda x: x.score, reverse=True)

    games = list(await session.scalars(select(MiniGame).where(MiniGame.status == "enabled").order_by(MiniGame.sort_order)))
    ranked_games = [RankedItem(kind="mini_game", id=g.key, score=float(100 - g.sort_order)) for g in games]
    hot = bool(windows)
    ordered = interleave(ranked_moments, ranked_games, hot_window=hot)[:limit]

    snapshots = {}
    moment_ids = [m.id for m in moments]
    if moment_ids:
        snapshots = {
            s.moment_id: s
            for s in await session.scalars(select(CrowdSnapshot).where(CrowdSnapshot.moment_id.in_(moment_ids)))
        }
    game_map = {g.key: g for g in games}
    items: list[dict] = []
    for item in ordered:
        if item.kind == "moment":
            m = by_id[UUID(item.id)]
            snap = snapshots.get(m.id)
            mine = await my_response(session, m.id, user_id, guest_id)
            items.append(serialize_moment(m, snap, mine.option_id if mine else None))
        else:
            g = game_map[item.id]
            items.append(serialize_game(g))
    return items


def serialize_game(g: MiniGame) -> dict:
    return {
        "type": "mini_game",
        "key": g.key,
        "title": g.title,
        "blurb": g.blurb,
        "config": g.config or {},
    }


def serialize_moment(m: Moment, snap: CrowdSnapshot | None, my_option_id: UUID | None) -> dict:
    options = sorted(m.options, key=lambda o: o.sort_order)
    return {
        "type": "moment",
        "id": str(m.id),
        "cardType": m.type,
        "prompt": m.prompt,
        "category": {"slug": m.category.slug, "name": m.category.name} if m.category else None,
        "status": m.status,
        "startsAt": m.starts_at.isoformat() if m.starts_at else None,
        "endsAt": m.ends_at.isoformat() if m.ends_at else None,
        "options": [{"id": str(o.id), "label": o.label, "sortOrder": o.sort_order} for o in options],
        "myOptionId": str(my_option_id) if my_option_id else None,
        "result": serialize_snapshot(m.id, snap) if snap else None,
    }


def serialize_snapshot(moment_id: UUID, snap: CrowdSnapshot | None) -> dict | None:
    if snap is None:
        return None
    return {
        "event": "crowd.snapshot",
        "momentId": str(moment_id),
        "version": snap.version,
        "generatedAt": snap.generated_at.isoformat() if snap.generated_at else None,
        "totalResponses": snap.total_responses,
        "optionCounts": snap.option_counts,
        "joinedLastMinute": snap.joined_last_minute,
        "volumeState": snap.volume_state or volume_state(snap.total_responses),
    }


async def my_response(
    session: AsyncSession, moment_id: UUID, user_id: UUID | None, guest_id: UUID | None
) -> Response | None:
    stmt = select(Response).where(Response.moment_id == moment_id)
    if user_id:
        stmt = stmt.where(Response.user_id == user_id)
    elif guest_id:
        stmt = stmt.where(Response.guest_session_id == guest_id)
    else:
        return None
    return await session.scalar(stmt)


async def friends_on_moment(
    session: AsyncSession, viewer_id: UUID, moment_id: UUID
) -> list[dict]:
    """Server-side privacy: never return Private responses."""
    pairs = await session.scalars(
        select(Friendship).where(
            Friendship.status == "accepted",
            or_(Friendship.user_a == viewer_id, Friendship.user_b == viewer_id),
        )
    )
    friend_ids: list[UUID] = []
    for f in pairs:
        friend_ids.append(f.user_b if f.user_a == viewer_id else f.user_a)
    if not friend_ids:
        return []
    rows = await session.execute(
        select(Response, Profile, ResponseVisibility)
        .join(Profile, Profile.user_id == Response.user_id)
        .outerjoin(
            ResponseVisibility,
            and_(
                ResponseVisibility.user_id == Response.user_id,
                ResponseVisibility.moment_id == moment_id,
            ),
        )
        .where(Response.moment_id == moment_id, Response.user_id.in_(friend_ids))
    )
    out = []
    for response, profile, vis_row in rows:
        default_vis = profile.default_visibility
        vis = vis_row.visibility if vis_row else default_vis
        if vis == "private":
            continue
        if vis == "friends" or vis == "public":
            out.append(
                {
                    "userId": str(profile.user_id),
                    "displayName": profile.display_name,
                    "avatarKey": profile.avatar_key,
                    "optionId": str(response.option_id),
                }
            )
    return out[:8]
