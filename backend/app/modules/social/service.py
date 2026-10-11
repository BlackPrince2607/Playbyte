import re
from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, delete, func, or_, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import Actor
from app.common.errors import AppError
from app.infrastructure.postgres.models import (
    Moment,
    MomentComment,
    MomentLike,
    MomentShare,
    Profile,
)

COMMENT_MAX = 280
COMMENT_PAGE_MAX = 50
OPEN_STATUSES = ("live", "closed")
EMPTY_ENGAGEMENT = {"likes": 0, "shares": 0, "comments": 0, "likedByMe": False}


def _owner(model, actor: Actor):
    if actor.user_id:
        return model.user_id == actor.user_id
    return model.guest_session_id == actor.guest_id


async def _require_moment(session: AsyncSession, moment_id: UUID) -> Moment:
    m = await session.get(Moment, moment_id)
    if m is None or m.status not in OPEN_STATUSES:
        raise AppError("not_found", "Moment not found.", 404)
    return m


async def _count(session: AsyncSession, model, moment_id: UUID) -> int:
    stmt = select(func.count()).select_from(model).where(model.moment_id == moment_id)
    if model is MomentComment:
        stmt = stmt.where(MomentComment.status == "visible")
    return int(await session.scalar(stmt) or 0)


async def _grouped_counts(session: AsyncSession, model, moment_ids: list[UUID]) -> dict[UUID, int]:
    stmt = select(model.moment_id, func.count()).where(model.moment_id.in_(moment_ids)).group_by(model.moment_id)
    if model is MomentComment:
        stmt = stmt.where(MomentComment.status == "visible")
    return {mid: int(n) for mid, n in (await session.execute(stmt)).all()}


async def engagement_for(
    session: AsyncSession, moment_ids: list[UUID], user_id: UUID | None, guest_id: UUID | None
) -> dict[UUID, dict]:
    """Like / share / comment counts per moment, plus whether the viewer liked it."""
    if not moment_ids:
        return {}
    likes = await _grouped_counts(session, MomentLike, moment_ids)
    shares = await _grouped_counts(session, MomentShare, moment_ids)
    comments = await _grouped_counts(session, MomentComment, moment_ids)
    liked: set[UUID] = set()
    if user_id or guest_id:
        owner = MomentLike.user_id == user_id if user_id else MomentLike.guest_session_id == guest_id
        liked = set(
            await session.scalars(select(MomentLike.moment_id).where(MomentLike.moment_id.in_(moment_ids), owner))
        )
    return {
        mid: {
            "likes": likes.get(mid, 0),
            "shares": shares.get(mid, 0),
            "comments": comments.get(mid, 0),
            "likedByMe": mid in liked,
        }
        for mid in moment_ids
    }


def _actor_values(actor: Actor) -> dict:
    return {"user_id": actor.user_id, "guest_session_id": None if actor.user_id else actor.guest_id}


def _conflict_target(actor: Actor) -> dict:
    if actor.user_id:
        return {"index_elements": ["moment_id", "user_id"], "index_where": text("user_id IS NOT NULL")}
    return {"index_elements": ["moment_id", "guest_session_id"], "index_where": text("guest_session_id IS NOT NULL")}


async def set_like(session: AsyncSession, actor: Actor, moment_id: UUID, liked: bool) -> dict:
    await _require_moment(session, moment_id)
    if liked:
        await session.execute(
            insert(MomentLike)
            .values(moment_id=moment_id, **_actor_values(actor))
            .on_conflict_do_nothing(**_conflict_target(actor))
        )
    else:
        await session.execute(delete(MomentLike).where(MomentLike.moment_id == moment_id, _owner(MomentLike, actor)))
    return {"liked": liked, "likes": await _count(session, MomentLike, moment_id)}


async def record_share(session: AsyncSession, actor: Actor, moment_id: UUID, channel: str | None) -> dict:
    """Counts each actor once per moment, however many times they reshare."""
    await _require_moment(session, moment_id)
    created = await session.scalar(
        insert(MomentShare)
        .values(moment_id=moment_id, channel=channel, **_actor_values(actor))
        .on_conflict_do_nothing(**_conflict_target(actor))
        .returning(MomentShare.id)
    )
    return {"created": created is not None, "shares": await _count(session, MomentShare, moment_id)}


def normalize_comment(raw: str) -> str:
    lines = (re.sub(r"[ \t]+", " ", line).strip() for line in raw.replace("\r\n", "\n").split("\n"))
    body = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
    if not body:
        raise AppError("invalid_comment", "Write something first.", 422)
    if len(body) > COMMENT_MAX:
        raise AppError("invalid_comment", f"Comments can be up to {COMMENT_MAX} characters.", 422)
    return body


def _serialize_comment(c: MomentComment, profile: Profile | None, viewer_id: UUID | None) -> dict:
    return {
        "id": str(c.id),
        "body": c.body,
        "createdAt": c.created_at.isoformat() if c.created_at else None,
        "author": {
            "userId": str(c.user_id),
            "displayName": profile.display_name if profile else "Player",
            "avatarKey": profile.avatar_key if profile else None,
        },
        "mine": viewer_id is not None and c.user_id == viewer_id,
    }


def _encode_cursor(c: MomentComment) -> str:
    return f"{c.created_at.isoformat()}|{c.id}"


def _decode_cursor(cursor: str) -> tuple[datetime, UUID]:
    try:
        ts, cid = cursor.rsplit("|", 1)
        return datetime.fromisoformat(ts), UUID(cid)
    except ValueError as exc:
        raise AppError("invalid_cursor", "Invalid cursor.", 422) from exc


async def list_comments(
    session: AsyncSession, actor: Actor, moment_id: UUID, *, cursor: str | None, limit: int
) -> dict:
    """Newest first; `nextCursor` pages to older comments."""
    await _require_moment(session, moment_id)
    limit = max(1, min(COMMENT_PAGE_MAX, limit))
    stmt = (
        select(MomentComment, Profile)
        .outerjoin(Profile, Profile.user_id == MomentComment.user_id)
        .where(MomentComment.moment_id == moment_id, MomentComment.status == "visible")
        .order_by(MomentComment.created_at.desc(), MomentComment.id.desc())
        .limit(limit + 1)
    )
    if cursor:
        ts, cid = _decode_cursor(cursor)
        stmt = stmt.where(
            or_(MomentComment.created_at < ts, and_(MomentComment.created_at == ts, MomentComment.id < cid))
        )
    rows = (await session.execute(stmt)).all()
    page = rows[:limit]
    return {
        "comments": [_serialize_comment(c, p, actor.user_id) for c, p in page],
        "nextCursor": _encode_cursor(page[-1][0]) if len(rows) > limit else None,
        "total": await _count(session, MomentComment, moment_id),
    }


async def add_comment(session: AsyncSession, actor: Actor, moment_id: UUID, raw: str) -> dict:
    if not actor.user_id:
        raise AppError("user_required", "Sign in to comment.", 401)
    body = normalize_comment(raw)
    await _require_moment(session, moment_id)
    row = MomentComment(moment_id=moment_id, user_id=actor.user_id, body=body, status="visible")
    session.add(row)
    await session.flush()
    await session.refresh(row)
    profile = await session.get(Profile, actor.user_id)
    return {
        "comment": _serialize_comment(row, profile, actor.user_id),
        "total": await _count(session, MomentComment, moment_id),
    }


async def delete_comment(session: AsyncSession, actor: Actor, moment_id: UUID, comment_id: UUID) -> dict:
    row = await session.get(MomentComment, comment_id)
    if row is None or row.moment_id != moment_id or row.status == "deleted":
        raise AppError("not_found", "Comment not found.", 404)
    if not actor.is_admin and (actor.user_id is None or row.user_id != actor.user_id):
        raise AppError("forbidden", "You can only delete your own comments.", 403)
    row.status = "deleted"
    await session.flush()
    return {"deleted": True, "total": await _count(session, MomentComment, moment_id)}
