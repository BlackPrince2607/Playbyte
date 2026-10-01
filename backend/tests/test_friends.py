from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.common.errors import AppError
from app.modules.friends.service import (
    accept_friend,
    delete_friend_request,
    remove_friend,
    request_friend,
)


def pending(requester, recipient, status="pending"):
    return SimpleNamespace(
        id=uuid4(),
        user_a=min(requester, recipient),
        user_b=max(requester, recipient),
        requested_by=requester,
        status=status,
    )


@pytest.mark.asyncio
async def test_request_friend_idempotent_for_duplicate() -> None:
    from_id = uuid4()
    to_id = uuid4()
    a, b = (from_id, to_id) if from_id < to_id else (to_id, from_id)
    existing = SimpleNamespace(id=uuid4(), user_a=a, user_b=b, status="pending", requested_by=from_id)

    session = AsyncMock()
    session.scalar = AsyncMock(return_value=existing)
    session.get = AsyncMock(return_value=SimpleNamespace(id=to_id))
    session.add = MagicMock()

    row = await request_friend(session, from_id, to_id)
    assert row.id == existing.id
    session.add.assert_not_called()


@pytest.mark.asyncio
async def test_accept_friend_rejects_requester() -> None:
    user_id = uuid4()
    other_id = uuid4()
    row = SimpleNamespace(
        id=uuid4(),
        user_a=min(user_id, other_id),
        user_b=max(user_id, other_id),
        requested_by=user_id,
        status="pending",
    )
    session = AsyncMock()
    session.get = AsyncMock(return_value=row)

    with pytest.raises(AppError) as exc:
        await accept_friend(session, user_id, row.id)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_accept_friend_by_recipient() -> None:
    requester = uuid4()
    recipient = uuid4()
    row = SimpleNamespace(
        id=uuid4(),
        user_a=min(requester, recipient),
        user_b=max(requester, recipient),
        requested_by=requester,
        status="pending",
    )
    session = AsyncMock()
    session.get = AsyncMock(return_value=row)

    updated = await accept_friend(session, recipient, row.id)
    assert updated.status == "accepted"


@pytest.mark.asyncio
async def test_request_back_accepts_pending_request() -> None:
    them, me = uuid4(), uuid4()
    row = pending(them, me)
    session = AsyncMock()
    session.scalar = AsyncMock(return_value=row)
    session.add = MagicMock()

    result = await request_friend(session, me, them)
    assert result.status == "accepted"
    session.add.assert_not_called()


@pytest.mark.asyncio
async def test_request_unknown_player_is_not_found() -> None:
    session = AsyncMock()
    session.scalar = AsyncMock(return_value=None)
    session.get = AsyncMock(return_value=None)

    with pytest.raises(AppError) as exc:
        await request_friend(session, uuid4(), uuid4())
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_request_self_is_rejected() -> None:
    me = uuid4()
    with pytest.raises(AppError) as exc:
        await request_friend(AsyncMock(), me, me)
    assert exc.value.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("side", ["requester", "recipient"])
async def test_either_side_can_delete_pending_request(side: str) -> None:
    requester, recipient = uuid4(), uuid4()
    row = pending(requester, recipient)
    session = AsyncMock()
    session.get = AsyncMock(return_value=row)

    await delete_friend_request(session, requester if side == "requester" else recipient, row.id)
    session.delete.assert_awaited_once_with(row)


@pytest.mark.asyncio
async def test_outsider_cannot_delete_request() -> None:
    row = pending(uuid4(), uuid4())
    session = AsyncMock()
    session.get = AsyncMock(return_value=row)

    with pytest.raises(AppError):
        await delete_friend_request(session, uuid4(), row.id)
    session.delete.assert_not_called()


@pytest.mark.asyncio
async def test_remove_friend_deletes_accepted_friendship() -> None:
    me, friend = uuid4(), uuid4()
    row = pending(me, friend, status="accepted")
    session = AsyncMock()
    session.scalar = AsyncMock(return_value=row)

    await remove_friend(session, me, friend)
    session.delete.assert_awaited_once_with(row)


@pytest.mark.asyncio
async def test_remove_friend_ignores_pending_request() -> None:
    me, other = uuid4(), uuid4()
    session = AsyncMock()
    session.scalar = AsyncMock(return_value=pending(me, other))

    with pytest.raises(AppError):
        await remove_friend(session, me, other)
    session.delete.assert_not_called()
