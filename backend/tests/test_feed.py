import random
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.modules.feed.ranking import FeedCursor, RankedItem, fill_page, rotate_games
from app.modules.feed.service import build_feed, serialize_moment

# Enabled games per engine, as seeded by supabase/seed/003_sdk_games.sql (44 rows, 12 engines).
CATALOG = {
    "guess": 4, "emoji_guess": 4, "odd_one_out": 4, "tap": 3, "word_search": 4, "spot_difference": 4,
    "fact_fake": 5, "choice": 4, "tap_dont_tap": 3, "maze": 4, "connect_dots": 3, "arrow_puzzle": 2,
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
        patch("app.modules.feed.service.answered_moment_ids", AsyncMock(return_value=set())),
        patch("app.modules.feed.service.my_option_ids", AsyncMock(return_value={})),
        patch("app.modules.feed.service.tags_for_moments", AsyncMock(return_value={})),
        patch("app.modules.feed.service.engagement_for", AsyncMock(return_value={})),
    ):
        items = (await build_feed(session, user_id=None, guest_id=uuid4(), limit=20, rng=random.Random(3)))["items"]
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
        prompt_hi=None,
        prompt_image_key=None,
        scoring_mode="crowd",
        category=SimpleNamespace(slug="sports", name="Sports"),
        status="live",
        starts_at=datetime.now(UTC),
        ends_at=None,
        options=[
            SimpleNamespace(id=option_id, label="A", label_hi=None, sort_order=0, image_key=None, is_correct=False),
            SimpleNamespace(id=uuid4(), label="B", label_hi=None, sort_order=1, image_key=None, is_correct=False),
        ],
    )
    payload = serialize_moment(m, snap=None, my_option_id=option_id)
    assert payload["myOptionId"] == str(option_id)


def test_serialize_moment_uses_hindi_when_lang_hi() -> None:
    option_id = uuid4()
    m = SimpleNamespace(
        id=uuid4(),
        type="poll",
        prompt="Who wins tonight?",
        prompt_hi="आज रात कौन जीतेगा?",
        prompt_image_key=None,
        scoring_mode="crowd",
        category=SimpleNamespace(slug="sports", name="Sports"),
        status="live",
        starts_at=datetime.now(UTC),
        ends_at=None,
        options=[
            SimpleNamespace(id=option_id, label="India", label_hi="भारत", sort_order=0, image_key=None, is_correct=False),
            SimpleNamespace(id=uuid4(), label="Australia", label_hi=None, sort_order=1, image_key=None, is_correct=False),
        ],
    )
    hi = serialize_moment(m, snap=None, my_option_id=None, lang="hi")
    assert hi["prompt"] == "आज रात कौन जीतेगा?"
    assert hi["options"][0]["label"] == "भारत"
    assert hi["options"][1]["label"] == "Australia"
    en = serialize_moment(m, snap=None, my_option_id=None, lang="en")
    assert en["prompt"] == "Who wins tonight?"
    assert en["options"][0]["label"] == "India"


async def feed_page(
    moments: list[SimpleNamespace],
    answered: set,
    seed: int,
    user_id=None,
    *,
    games: list[SimpleNamespace] | None = None,
    limit: int = 20,
    cursor: str | None = None,
) -> dict:
    session = AsyncMock()
    session.scalars = AsyncMock(side_effect=[list(games or []), []])
    with (
        patch("app.modules.feed.service.interest_ids", AsyncMock(return_value=set())),
        patch("app.modules.feed.service.active_window_ids", AsyncMock(return_value=set())),
        patch("app.modules.feed.service.load_live_moments", AsyncMock(return_value=moments)),
        patch("app.modules.feed.service.answered_moment_ids", AsyncMock(return_value=answered)) as answered_ids,
        patch("app.modules.feed.service.my_option_ids", AsyncMock(return_value={})),
        patch("app.modules.feed.service.tags_for_moments", AsyncMock(return_value={})),
        patch("app.modules.feed.service.engagement_for", AsyncMock(return_value={})),
    ):
        page = await build_feed(
            session, user_id=user_id, guest_id=None, limit=limit, cursor=cursor, rng=random.Random(seed)
        )
    if user_id:
        answered_ids.assert_awaited_once_with(session, [m.id for m in moments], user_id, None)
    return page


async def feed_moment_ids(moments: list[SimpleNamespace], answered: set, seed: int, user_id=None) -> list[str]:
    page = await feed_page(moments, answered, seed, user_id)
    return [i["id"] for i in page["items"] if i["type"] == "moment"]


@pytest.mark.asyncio
async def test_build_feed_keeps_only_the_selected_category() -> None:
    kpop_id = uuid4()
    sports_id = uuid4()
    kpop = moment(0)
    kpop.category_id = kpop_id
    kpop.category = SimpleNamespace(slug="kpop", name="K-Pop")
    kpop.prompt = "Your bias is the one who…"
    sports = moment(1)
    sports.category_id = sports_id
    sports.category = SimpleNamespace(slug="sports", name="Sports")
    session = AsyncMock()
    session.scalars = AsyncMock(side_effect=[[], []])
    with (
        patch("app.modules.feed.service.interest_ids", AsyncMock(return_value={kpop_id})),
        patch("app.modules.feed.service.active_window_ids", AsyncMock(return_value=set())),
        patch("app.modules.feed.service.load_live_moments", AsyncMock(return_value=[kpop, sports])),
        patch("app.modules.feed.service.answered_moment_ids", AsyncMock(return_value=set())),
        patch("app.modules.feed.service.my_option_ids", AsyncMock(return_value={})),
        patch("app.modules.feed.service.tags_for_moments", AsyncMock(return_value={})),
        patch("app.modules.feed.service.engagement_for", AsyncMock(return_value={})),
    ):
        page = await build_feed(session, user_id=uuid4(), guest_id=None, limit=10, rng=random.Random(1))
    moment_ids = [item["id"] for item in page["items"] if item["type"] == "moment"]
    assert moment_ids == [str(kpop.id)]


@pytest.mark.asyncio
async def test_build_feed_leads_with_unanswered_then_recycles() -> None:
    moments = [moment(i) for i in range(6)]
    answered = {moments[0].id, moments[3].id}
    unanswered = [str(m.id) for m in moments if m.id not in answered]
    ids = await feed_moment_ids(moments, answered, seed=1, user_id=uuid4())
    assert sorted(ids) == sorted(str(m.id) for m in moments)
    assert sorted(ids[: len(unanswered)]) == sorted(unanswered)


@pytest.mark.asyncio
async def test_build_feed_reshuffles_moments_each_request() -> None:
    moments = [moment(i) for i in range(10)]
    orders = {tuple(await feed_moment_ids(moments, set(), seed=s)) for s in range(5)}
    assert len(orders) > 1
    assert all(sorted(o) == sorted(str(m.id) for m in moments) for o in orders)


def moment_ids_of(page: dict) -> list[str]:
    return [i["id"] for i in page["items"] if i["type"] == "moment"]


@pytest.mark.asyncio
async def test_build_feed_cursor_pages_through_every_moment_then_starts_over() -> None:
    moments = [moment(i) for i in range(25)]
    seen: list[str] = []
    cursor = None
    for seed in range(3):
        page = await feed_page(moments, set(), seed, limit=10, cursor=cursor)
        seen += moment_ids_of(page)
        cursor = page["cursor"]
    assert len(seen) == 30
    assert sorted(set(seen[:25])) == sorted(str(m.id) for m in moments)
    assert len(set(seen[25:])) == 5
    assert cursor


@pytest.mark.asyncio
async def test_build_feed_cursor_prefers_still_unanswered_on_next_page() -> None:
    moments = [moment(i) for i in range(12)]
    first = await feed_page(moments, set(), 1, limit=4)
    rest = [m for m in moments if str(m.id) not in moment_ids_of(first)]
    answered_now = {m.id for m in rest[:4]}
    still_open = {str(m.id) for m in rest[4:]}
    second = await feed_page(moments, answered_now, 2, limit=4, cursor=first["cursor"])
    second_moments = moment_ids_of(second)
    assert not set(second_moments) & set(moment_ids_of(first))
    assert set(second_moments) <= still_open


@pytest.mark.asyncio
async def test_build_feed_recycles_answered_moments_instead_of_games_only() -> None:
    moments = [moment(i) for i in range(3)]
    page = await feed_page(moments, {m.id for m in moments}, 1, games=catalog_games()[:5], limit=10)
    types = [i["type"] for i in page["items"]]
    assert types.count("moment") == 3
    assert types.count("mini_game") == 5
    assert sorted(moment_ids_of(page)) == sorted(str(m.id) for m in moments)
    assert page["cursor"]


@pytest.mark.asyncio
async def test_build_feed_ends_only_when_there_is_nothing_to_show() -> None:
    page = await feed_page([], set(), 1)
    assert page == {"items": [], "cursor": None}


@pytest.mark.asyncio
async def test_build_feed_small_pool_shows_each_moment_once_per_page() -> None:
    moments = [moment(0)]
    page = await feed_page(moments, set(), 1, limit=20)
    assert moment_ids_of(page) == [str(moments[0].id)]
    again = await feed_page(moments, set(), 2, limit=20, cursor=page["cursor"])
    assert moment_ids_of(again) == [str(moments[0].id)]


@pytest.mark.asyncio
async def test_build_feed_bad_cursor_starts_a_fresh_feed() -> None:
    moments = [moment(i) for i in range(4)]
    page = await feed_page(moments, set(), 1, cursor="not-a-cursor")
    assert sorted(moment_ids_of(page)) == sorted(str(m.id) for m in moments)


def test_fill_page_hot_window_spaces_games_further_apart() -> None:
    moments = [RankedItem("moment", str(i), 10) for i in range(8)]
    games = [RankedItem("mini_game", f"g{i}", 1) for i in range(4)]
    page, _ = fill_page(
        rank_moments=lambda _: moments,
        rank_games=lambda _: games,
        cursor=FeedCursor(0, 0, 0, 0),
        exclude=set(),
        limit=10,
        cadence=4,
        new_seed=lambda: 1,
    )
    assert ["m" if i.kind == "moment" else "g" for i in page] == list("mmmmgmmmmg")


def test_feed_cursor_round_trips_and_rejects_garbage() -> None:
    c = FeedCursor(5, 12, 7, 3)
    assert FeedCursor.decode(c.encode()) == c
    for raw in ("", "1.2.3", "1.2.3.x", "1.-2.3.4"):
        assert FeedCursor.decode(raw) is None
