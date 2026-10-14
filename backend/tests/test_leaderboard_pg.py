"""Leaderboard queries against a real Postgres.

Skipped unless TEST_DATABASE_URL points at a disposable database (CI provides one). The tables are
dropped and recreated from the models.
"""

import os
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.infrastructure.postgres.models import Friendship, Profile, User, UserDailyStat
from app.modules.leaderboard.service import leaderboard
from app.modules.responses.service import _bump_daily

DB_URL = os.environ.get("TEST_DATABASE_URL", "")
pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(not DB_URL, reason="TEST_DATABASE_URL not set"),
]

TABLES = [User.__table__, Profile.__table__, Friendship.__table__, UserDailyStat.__table__]
ENUMS = {
    "user_status": "('active', 'disabled', 'deleted')",
    "actor_visibility": "('public', 'friends', 'private')",
    "friendship_status": "('pending', 'accepted', 'blocked')",
}


def _url(raw: str) -> str:
    return raw.replace("postgresql://", "postgresql+asyncpg://", 1) if raw.startswith("postgresql://") else raw


@pytest.fixture
async def db():
    engine = create_async_engine(_url(DB_URL))
    async with engine.begin() as conn:
        await conn.execute(text("DROP TABLE IF EXISTS user_daily_stats, friendships, profiles, users CASCADE"))
        for name, values in ENUMS.items():
            await conn.execute(text(f"DROP TYPE IF EXISTS {name} CASCADE"))
            await conn.execute(text(f"CREATE TYPE {name} AS ENUM {values}"))
        await conn.run_sync(lambda c: User.metadata.create_all(c, tables=TABLES))
    try:
        yield async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    finally:
        await engine.dispose()


async def _player(
    s: AsyncSession, name: str, *, recent: int = 0, old: int = 0, visibility: str = "friends", status: str = "active"
) -> UUID:
    user = User(status=status)
    s.add(user)
    await s.flush()
    s.add(Profile(user_id=user.id, display_name=name, default_visibility=visibility))
    today = datetime.now(UTC).date()
    if recent:
        s.add(UserDailyStat(user_id=user.id, date=today, moments_joined=recent, games_played=0))
    if old:
        s.add(UserDailyStat(user_id=user.id, date=today - timedelta(days=30), moments_joined=0, games_played=old))
    return user.id


def _friends(s: AsyncSession, a: UUID, b: UUID, status: str = "accepted") -> None:
    lo, hi = sorted([a, b])
    s.add(Friendship(user_a=lo, user_b=hi, status=status, requested_by=a))


async def test_global_week_ranks_visible_players_by_recent_points(db) -> None:
    async with db() as s:
        ada = await _player(s, "Ada", recent=5)
        bo = await _player(s, "Bo", recent=3, old=50)
        cy = await _player(s, "Cy", recent=3)
        await _player(s, "Hidden", recent=9, visibility="private")
        await _player(s, "Gone", recent=9, status="deleted")
        await _player(s, "Idle")
        await s.commit()

        board = await leaderboard(s, scope="global", period="week", viewer=None)

    rows = sorted((e["rank"], e["displayName"], e["points"]) for e in board["entries"])
    assert rows == [(1, "Ada", 50), (2, "Bo", 30), (2, "Cy", 30)]
    assert board["you"] is None
    assert {e["userId"] for e in board["entries"]} == {str(ada), str(bo), str(cy)}


async def test_global_all_time_includes_older_activity(db) -> None:
    async with db() as s:
        await _player(s, "Ada", recent=5)
        bo = await _player(s, "Bo", recent=3, old=50)
        await s.commit()

        board = await leaderboard(s, scope="global", period="all", viewer=bo)

    assert board["entries"][0]["displayName"] == "Bo"
    assert board["entries"][0]["points"] == 530
    assert board["you"]["rank"] == 1 and board["you"]["isYou"]


async def test_global_you_outside_the_page_gets_a_rank(db) -> None:
    async with db() as s:
        for i in range(3):
            await _player(s, f"Top{i}", recent=10 + i)
        me = await _player(s, "Me", recent=1)
        await s.commit()

        board = await leaderboard(s, scope="global", period="week", viewer=me, limit=2)

    assert len(board["entries"]) == 2
    assert board["you"]["rank"] == 4
    assert board["you"]["points"] == 10
    assert board["you"]["hidden"] is False


async def test_global_private_viewer_is_told_they_are_hidden(db) -> None:
    async with db() as s:
        await _player(s, "Ada", recent=2)
        me = await _player(s, "Me", recent=7, visibility="private")
        await s.commit()

        board = await leaderboard(s, scope="global", period="week", viewer=me)

    assert [e["displayName"] for e in board["entries"]] == ["Ada"]
    assert board["you"]["hidden"] is True
    assert board["you"]["rank"] is None
    assert board["you"]["points"] == 70


async def test_friends_board_lists_accepted_friends_and_you(db) -> None:
    async with db() as s:
        me = await _player(s, "Me", recent=2)
        pal = await _player(s, "Pal", recent=4)
        quiet = await _player(s, "Quiet")
        pending = await _player(s, "Pending", recent=9)
        private = await _player(s, "Private", recent=9, visibility="private")
        stranger = await _player(s, "Stranger", recent=9)
        _friends(s, me, pal)
        _friends(s, quiet, me)
        _friends(s, me, pending, status="pending")
        _friends(s, me, private)
        await s.commit()

        board = await leaderboard(s, scope="friends", period="week", viewer=me)

    rows = [(e["displayName"], e["rank"], e["points"], e["isYou"]) for e in board["entries"]]
    assert rows == [("Pal", 1, 40, False), ("Me", 2, 20, True), ("Quiet", 3, 0, False)]
    assert board["you"]["rank"] == 2
    assert str(stranger) not in {e["userId"] for e in board["entries"]}


async def test_first_and_later_actions_of_the_day_both_count(db) -> None:
    async with db() as s:
        me = await _player(s, "Me")
        await s.commit()

        await _bump_daily(s, me, moments=1)
        await _bump_daily(s, me, games=1)
        await _bump_daily(s, me, moments=1)
        await s.commit()

        row = await s.get(UserDailyStat, (me, datetime.now(UTC).date()), populate_existing=True)
        board = await leaderboard(s, scope="global", period="week", viewer=me)

    assert (row.moments_joined, row.games_played) == (2, 1)
    assert board["entries"][0]["points"] == 30


async def test_friends_board_with_no_friends_is_just_you(db) -> None:
    async with db() as s:
        me = await _player(s, "Me")
        await s.commit()

        board = await leaderboard(s, scope="friends", period="all", viewer=me)

    assert [(e["displayName"], e["rank"], e["points"]) for e in board["entries"]] == [("Me", 1, 0)]
