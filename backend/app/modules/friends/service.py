from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors import AppError
from app.infrastructure.postgres.models import Friendship, Profile, User


def _pair(a: UUID, b: UUID) -> tuple[UUID, UUID]:
    return (a, b) if a < b else (b, a)


async def list_friend_requests(session: AsyncSession, user_id: UUID) -> dict:
    rows = await session.scalars(
        select(Friendship).where(
            Friendship.status == "pending",
            or_(Friendship.user_a == user_id, Friendship.user_b == user_id),
        )
    )
    incoming: list[dict] = []
    outgoing: list[dict] = []
    for f in rows:
        other = f.user_b if f.user_a == user_id else f.user_a
        profile = await session.get(Profile, other)
        entry = {
            "id": str(f.id),
            "userId": str(other),
            "displayName": profile.display_name if profile else "Player",
            "avatarKey": profile.avatar_key if profile else None,
        }
        if f.requested_by == user_id:
            outgoing.append(entry)
        else:
            incoming.append(entry)
    return {"incoming": incoming, "outgoing": outgoing}


async def list_friends(session: AsyncSession, user_id: UUID) -> list[dict]:
    rows = await session.scalars(
        select(Friendship).where(
            Friendship.status == "accepted",
            or_(Friendship.user_a == user_id, Friendship.user_b == user_id),
        )
    )
    out = []
    for f in rows:
        other = f.user_b if f.user_a == user_id else f.user_a
        profile = await session.get(Profile, other)
        out.append(
            {
                "userId": str(other),
                "displayName": profile.display_name if profile else "Player",
                "avatarKey": profile.avatar_key if profile else None,
                "status": f.status,
            }
        )
    return out


async def request_friend(session: AsyncSession, from_id: UUID, to_id: UUID) -> Friendship:
    if from_id == to_id:
        raise AppError("invalid", "Cannot friend yourself.", 422)
    a, b = _pair(from_id, to_id)
    existing = await session.scalar(select(Friendship).where(Friendship.user_a == a, Friendship.user_b == b))
    if existing:
        if existing.status == "blocked":
            raise AppError("forbidden", "Cannot create this connection.", 403)
        return existing
    other = await session.get(User, to_id)
    if other is None:
        raise AppError("not_found", "User not found.", 404)
    row = Friendship(user_a=a, user_b=b, status="pending", requested_by=from_id)
    session.add(row)
    await session.flush()
    return row


async def accept_friend(session: AsyncSession, user_id: UUID, request_id: UUID) -> Friendship:
    row = await session.get(Friendship, request_id)
    if row is None:
        raise AppError("not_found", "Request not found.", 404)
    if user_id not in {row.user_a, row.user_b} or row.requested_by == user_id:
        raise AppError("forbidden", "Cannot accept this request.", 403)
    row.status = "accepted"
    return row
