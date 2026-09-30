import random
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.modules.feed.ranking import rotate_games
from app.modules.feed.service import build_feed, serialize_moment

# Enabled games per engine, as seeded by supabase/seed/003_sdk_games.sql (42 rows, 11 engines).
CATALOG = {
    "guess": 4, "emoji_guess": 4, "odd_one_out": 4, "tap": 3, "word_search": 4, "spot_difference": 4,
    "fact_fake": 5, "choice": 4, "tap_dont_tap": 3, "maze": 4, "connect_dots": 3,
}


def catalog_games() -> list[SimpleNamespace]:
    games, order = [], 0
    for engine, n in CATALOG.items():
        for i in range(n):
            games.append(
                SimpleNamespace(
                    key=f"{engine}_{i}", title=engine, blurb="", config={}, engine=engine,
                    variation=f"v{i}", sort_order=order, status="enabled",
                )
            )
            order += 1
    return games


def moment(i: int) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(), type="poll", prompt=f"Moment {i}", prompt_image_key=None, scoring_mode="crowd",
        category_id=uuid4(), category=SimpleNamespace(slug="sports", name="Sports"), status="live",
        content_window_id=None, starts_at=datetime.now(UTC), ends_at=None,
        options=[SimpleNamespace(id=uuid4(), label="A", sort_order=0, image_key=None, is_correct=False)],
    )


def test_rotate_games_keeps_every_game_once() -> None:
    games = catalog_games()
    rotated = rotate_games(games, lambda g: g.engine, random.Random(1))
    assert sorted(g.key for g in rotated) == sorted(g.key for g in games)


def test_rotate_games_leads_with_one_game_per_engine() -> None:
    rotated = rotate_games(catalog_games(), lambda g: g.engine, random.Random(2))
    assert len({g.engine for g in rotated[: len(CATALOG)]}) == len(CATALOG)


def test_rotate_games_is_seeded() -> None:
    keys = lambda seed: [g.key for g in rotate_games(catalog_games(), lambda g: g.engine, random.Random(seed))]  # noqa: E731
    assert keys(7) == keys(7)
    assert keys(7) != keys(8)


def test_rotate_games_surfaces_every_game_across_feeds() -> None:
    seen: set[str] = set()
    for seed in range(200):
        seen |= {g.key for g in rotate_games(catalog_games(), lambda g: g.engine, random.Random(seed))[:6]}
    assert seen == {g.key for g in catalog_games()}


@pytest.mark.asyncio
async def test_build_feed_game_slots_span_distinct_engines() -> None:
    session = AsyncMock()
    session.scalars = AsyncMock(side_effect=[catalog_games(), []])
    with (
        patch("app.modules.feed.service.interest_ids", AsyncMock(return_value=set())),
        patch("app.modules.feed.service.active_window_ids", AsyncMock(return_value=set())),
        patch("app.modules.feed.service.load_live_moments", AsyncMock(return_value=[moment(i) for i in range(14)])),
        patch("app.modules.feed.service.my_response", AsyncMock(return_value=None)),
        patch("app.modules.feed.service.tags_for_moments", AsyncMock(return_value={})),
    ):
        items = await build_feed(session, user_id=None, guest_id=uuid4(), limit=20, rng=random.Random(3))
    games = [i for i in items if i["type"] == "mini_game"]
    assert len(items) == 20
    assert len(games) == 6
    assert len({g["engine"] for g in games}) == 6


def test_serialize_moment_includes_my_option_id() -> None:
    moment_id = uuid4()
    option_id = uuid4()
    m = SimpleNamespace(
        id=moment_id,
        type="poll",
        prompt="Pick one",
        prompt_image_key=None,
        scoring_mode="crowd",
        category=SimpleNamespace(slug="sports", name="Sports"),
        status="live",
        starts_at=datetime.now(UTC),
        ends_at=None,
        options=[
            SimpleNamespace(id=option_id, label="A", sort_order=0, image_key=None, is_correct=False),
            SimpleNamespace(id=uuid4(), label="B", sort_order=1, image_key=None, is_correct=False),
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
        prompt_image_key=None,
        scoring_mode="crowd",
        category_id=category_id,
        category=SimpleNamespace(slug="sports", name="Sports"),
        status="live",
        content_window_id=None,
        starts_at=datetime.now(UTC),
        ends_at=None,
        options=[SimpleNamespace(id=option_id, label="A", sort_order=0, image_key=None, is_correct=False)],
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
