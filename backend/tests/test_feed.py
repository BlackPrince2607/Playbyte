from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.modules.feed.service import build_feed, serialize_moment


def test_serialize_moment_includes_my_option_id() -> None:
    moment_id = uuid4()
    option_id = uuid4()
    category_id = uuid4()
    m = SimpleNamespace(
        id=moment_id,
        type="poll",
        prompt="Pick one",
        category=SimpleNamespace(slug="sports", name="Sports"),
        status="live",
        starts_at=datetime.now(UTC),
        ends_at=None,
        options=[
            SimpleNamespace(id=option_id, label="A", sort_order=0),
            SimpleNamespace(id=uuid4(), label="B", sort_order=1),
        ],
    )
    payload = serialize_moment(m, snap=None, my_option_id=option_id)
    assert payload["myOptionId"] == str(option_id)


@pytest.mark.asyncio
async def test_build_feed_includes_my_option_id() -> None:
    moment_id = uuid4()
    option_id = uuid4()
    category_id = uuid4()
    m = SimpleNamespace(
        id=moment_id,
        type="poll",
        prompt="Pick one",
        category_id=category_id,
        category=SimpleNamespace(slug="sports", name="Sports"),
        status="live",
        content_window_id=None,
        starts_at=datetime.now(UTC),
        ends_at=None,
        options=[SimpleNamespace(id=option_id, label="A", sort_order=0)],
    )
    mine = SimpleNamespace(option_id=option_id)
    user_id = uuid4()
    session = AsyncMock()
    session.scalars = AsyncMock(return_value=[])

    with (
        patch("app.modules.feed.service.interest_ids", AsyncMock(return_value=set())),
        patch("app.modules.feed.service.active_window_ids", AsyncMock(return_value=set())),
        patch("app.modules.feed.service.load_live_moments", AsyncMock(return_value=[m])),
        patch("app.modules.feed.service.my_response", AsyncMock(return_value=mine)) as my_response,
    ):
        items = await build_feed(session, user_id=user_id, guest_id=None, limit=10)

    my_response.assert_awaited_once_with(session, moment_id, user_id, None)
    assert items[0]["type"] == "moment"
    assert items[0]["myOptionId"] == str(option_id)
