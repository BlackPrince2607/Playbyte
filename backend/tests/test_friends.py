from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.common.errors import AppError
from app.modules.friends.service import accept_friend, request_friend


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
