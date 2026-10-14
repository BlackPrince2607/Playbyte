from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors import AppError
from app.infrastructure.postgres.models import Friendship, Profile, User
from app.modules.friends.codes import code_range, parse_code


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
        raise AppError("invalid", "That's your own player ID.", 422)
    a, b = _pair(from_id, to_id)
    existing = await session.scalar(select(Friendship).where(Friendship.user_a == a, Friendship.user_b == b))
    if existing:
        if existing.status == "blocked":
            raise AppError("forbidden", "Cannot create this connection.", 403)
        # They already asked us: sending one back means both want it.
        if existing.status == "pending" and existing.requested_by != from_id:
            existing.status = "accepted"
        return existing
    other = await session.get(User, to_id)
    if other is None:
        raise AppError("user_not_found", "No player has that ID.", 404)
    row = Friendship(user_a=a, user_b=b, status="pending", requested_by=from_id)
    session.add(row)
    await session.flush()
    return row


async def find_by_code(session: AsyncSession, code: str) -> User | None:
    """Active player owning a friend code; None when unknown or, rarely, shared by two players."""
    lo, hi = code_range(code)
    rows = (
        await session.scalars(
            select(User).where(User.id >= lo, User.id <= hi, User.status == "active").limit(2)
        )
    ).all()
    return rows[0] if len(rows) == 1 else None


async def add_friend_by_code(session: AsyncSession, user_id: UUID, raw_code: str) -> dict:
    """Invite links and typed codes make friends straight away: sharing your code is the consent."""
    code = parse_code(raw_code)
    if code is None:
        raise AppError("invalid_code", "That friend code doesn't look right. It has 8 letters and numbers.", 422)
    other = await find_by_code(session, code)
    if other is None:
        raise AppError("user_not_found", "No player has that friend code.", 404)
    if other.id == user_id:
        raise AppError("invalid", "That's your own friend code. Share it with friends instead.", 422)
    a, b = _pair(user_id, other.id)
    row = await session.scalar(select(Friendship).where(Friendship.user_a == a, Friendship.user_b == b))
    status = "added"
    if row is None:
        session.add(Friendship(user_a=a, user_b=b, status="accepted", requested_by=user_id))
    elif row.status == "blocked":
        raise AppError("forbidden", "Cannot create this connection.", 403)
    elif row.status == "accepted":
        status = "already"
    else:
        row.status = "accepted"
    await session.flush()
    profile = await session.get(Profile, other.id)
    return {
        "status": status,
        "friend": {
            "userId": str(other.id),
            "displayName": profile.display_name if profile else "Player",
            "avatarKey": profile.avatar_key if profile else None,
        },
    }


async def accept_friend(session: AsyncSession, user_id: UUID, request_id: UUID) -> Friendship:
    row = await session.get(Friendship, request_id)
    if row is None:
        raise AppError("not_found", "Request not found.", 404)
    if user_id not in {row.user_a, row.user_b} or row.requested_by == user_id:
        raise AppError("forbidden", "Cannot accept this request.", 403)
    row.status = "accepted"
    return row


async def delete_friend_request(session: AsyncSession, user_id: UUID, request_id: UUID) -> None:
    """Declines an incoming request or cancels an outgoing one."""
    row = await session.get(Friendship, request_id)
    if row is None or user_id not in {row.user_a, row.user_b} or row.status != "pending":
        raise AppError("not_found", "Request not found.", 404)
    await session.delete(row)


async def remove_friend(session: AsyncSession, user_id: UUID, friend_id: UUID) -> None:
    a, b = _pair(user_id, friend_id)
    row = await session.scalar(select(Friendship).where(Friendship.user_a == a, Friendship.user_b == b))
    if row is None or row.status != "accepted":
        raise AppError("not_found", "You're not friends with this player.", 404)
    await session.delete(row)
