"""Likes, shares and comments on moments."""
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.common.auth import Actor
from app.common.errors import AppError
from app.modules.social.service import (
    _decode_cursor,
    _encode_cursor,
    add_comment,
    delete_comment,
    engagement_for,
    normalize_comment,
    record_share,
    set_like,
)


def _rows(rows):
    result = MagicMock()
    result.all.return_value = rows
    return result


def test_normalize_comment_trims_and_collapses() -> None:
    assert normalize_comment("  hello   there \r\n\r\n\r\n\r\nbye ") == "hello there\n\nbye"


@pytest.mark.parametrize("raw", ["", "   \n\t ", "x" * 281])
def test_normalize_comment_rejects_empty_and_long(raw: str) -> None:
    with pytest.raises(AppError) as exc:
        normalize_comment(raw)
    assert exc.value.status_code == 422


def test_cursor_round_trip() -> None:
    c = SimpleNamespace(created_at=datetime(2026, 10, 9, 8, 0, tzinfo=UTC), id=uuid4())
    assert _decode_cursor(_encode_cursor(c)) == (c.created_at, c.id)
    with pytest.raises(AppError):
        _decode_cursor("garbage")


@pytest.mark.asyncio
async def test_engagement_for_merges_counts_and_viewer_like() -> None:
    a, b = uuid4(), uuid4()
    session = AsyncMock()
    session.execute = AsyncMock(side_effect=[_rows([(a, 3)]), _rows([(b, 1)]), _rows([(a, 2)])])
    session.scalars = AsyncMock(return_value=[a])
    out = await engagement_for(session, [a, b], user_id=None, guest_id=uuid4())
    assert out[a] == {"likes": 3, "shares": 0, "comments": 2, "likedByMe": True}
    assert out[b] == {"likes": 0, "shares": 1, "comments": 0, "likedByMe": False}


@pytest.mark.asyncio
async def test_engagement_for_empty_skips_queries() -> None:
    session = AsyncMock()
    assert await engagement_for(session, [], None, None) == {}
    session.execute.assert_not_called()


@pytest.mark.asyncio
async def test_like_requires_open_moment() -> None:
    session = AsyncMock()
    session.get = AsyncMock(return_value=SimpleNamespace(status="draft"))
    with pytest.raises(AppError) as exc:
        await set_like(session, Actor(kind="guest", guest_id=uuid4()), uuid4(), liked=True)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_like_and_unlike_return_fresh_count() -> None:
    session = AsyncMock()
    session.get = AsyncMock(return_value=SimpleNamespace(status="live"))
    session.scalar = AsyncMock(side_effect=[5, 4])
    actor = Actor(kind="user", user_id=uuid4())
    assert await set_like(session, actor, uuid4(), liked=True) == {"liked": True, "likes": 5}
    assert await set_like(session, actor, uuid4(), liked=False) == {"liked": False, "likes": 4}
    assert session.execute.await_count == 2


@pytest.mark.asyncio
async def test_repeat_share_is_not_double_counted() -> None:
    session = AsyncMock()
    session.get = AsyncMock(return_value=SimpleNamespace(status="live"))
    session.scalar = AsyncMock(side_effect=[None, 7])  # insert hit the unique index, then count
    out = await record_share(session, Actor(kind="guest", guest_id=uuid4()), uuid4(), "system")
    assert out == {"created": False, "shares": 7}


@pytest.mark.asyncio
async def test_guests_cannot_comment() -> None:
    with pytest.raises(AppError) as exc:
        await add_comment(AsyncMock(), Actor(kind="guest", guest_id=uuid4()), uuid4(), "hi")
    assert exc.value.code == "user_required"


@pytest.mark.asyncio
async def test_add_comment_returns_author_and_total() -> None:
    user_id, moment_id = uuid4(), uuid4()
    session = AsyncMock()
    session.add = MagicMock()

    async def refresh(row):
        row.id = uuid4()
        row.created_at = datetime.now(UTC)

    session.refresh = AsyncMock(side_effect=refresh)
    session.get = AsyncMock(
        side_effect=[SimpleNamespace(status="live"), SimpleNamespace(display_name="Asha", avatar_key=None)]
    )
    session.scalar = AsyncMock(return_value=1)
    out = await add_comment(session, Actor(kind="user", user_id=user_id), moment_id, "  Chai, always ")
    assert out["total"] == 1
    assert out["comment"]["body"] == "Chai, always"
    assert out["comment"]["author"]["displayName"] == "Asha"
    assert out["comment"]["mine"] is True


@pytest.mark.asyncio
async def test_only_author_can_delete_comment() -> None:
    moment_id = uuid4()
    row = SimpleNamespace(moment_id=moment_id, user_id=uuid4(), status="visible")
    session = AsyncMock()
    session.get = AsyncMock(return_value=row)
    with pytest.raises(AppError) as exc:
        await delete_comment(session, Actor(kind="user", user_id=uuid4()), moment_id, uuid4())
    assert exc.value.status_code == 403

    session.scalar = AsyncMock(return_value=0)
    out = await delete_comment(session, Actor(kind="user", user_id=row.user_id), moment_id, uuid4())
    assert out == {"deleted": True, "total": 0}
    assert row.status == "deleted"
