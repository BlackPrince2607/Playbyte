"""Adding friends by code against a real Postgres.

Skipped unless TEST_DATABASE_URL points at a disposable database (CI provides one). The tables are
dropped and recreated from the models.
"""

import os
from uuid import UUID

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.common.errors import AppError
from app.infrastructure.postgres.models import Friendship, Profile, User
from app.modules.friends.codes import friend_code
from app.modules.friends.service import add_friend_by_code, list_friends

DB_URL = os.environ.get("TEST_DATABASE_URL", "")
pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(not DB_URL, reason="TEST_DATABASE_URL not set"),
]

TABLES = [User.__table__, Profile.__table__, Friendship.__table__]
ENUMS = {
    "user_status": "('active', 'disabled', 'deleted')",
    "actor_visibility": "('public', 'friends', 'private')",
    "friendship_status": "('pending', 'accepted', 'blocked')",
}


def _url(raw: str) -> str:
    return (
        raw.replace("postgresql://", "postgresql+asyncpg://", 1)
        if raw.startswith("postgresql://")
        else raw
    )


@pytest.fixture
async def db():
    engine = create_async_engine(_url(DB_URL))
    async with engine.begin() as conn:
        await conn.execute(
            text("DROP TABLE IF EXISTS user_daily_stats, friendships, profiles, users CASCADE")
        )
        for name, values in ENUMS.items():
            await conn.execute(text(f"DROP TYPE IF EXISTS {name} CASCADE"))
            await conn.execute(text(f"CREATE TYPE {name} AS ENUM {values}"))
        await conn.run_sync(lambda c: User.metadata.create_all(c, tables=TABLES))
    try:
        yield async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    finally:
        await engine.dispose()


async def _player(s: AsyncSession, name: str, status: str = "active") -> UUID:
    user = User(status=status)
    s.add(user)
    await s.flush()
    s.add(Profile(user_id=user.id, display_name=name))
    return user.id


async def _status(s: AsyncSession, a: UUID, b: UUID) -> str | None:
    lo, hi = sorted([a, b])
    row = await s.scalar(select(Friendship).where(Friendship.user_a == lo, Friendship.user_b == hi))
    return row.status if row else None


async def test_code_adds_friend_instantly_both_ways(db) -> None:
    async with db() as s:
        ada = await _player(s, "Ada")
        bo = await _player(s, "Bo")
        await s.commit()

    async with db() as s:
        out = await add_friend_by_code(s, ada, f"https://x.app/add/{friend_code(bo).lower()}")
        await s.commit()
    assert out == {
        "status": "added",
        "friend": {"userId": str(bo), "displayName": "Bo", "avatarKey": None},
    }

    async with db() as s:
        assert [f["userId"] for f in await list_friends(s, bo)] == [str(ada)]
        again = await add_friend_by_code(s, ada, friend_code(bo))
    assert again["status"] == "already"


async def test_code_accepts_a_pending_request(db) -> None:
    async with db() as s:
        ada = await _player(s, "Ada")
        bo = await _player(s, "Bo")
        lo, hi = sorted([ada, bo])
        s.add(Friendship(user_a=lo, user_b=hi, status="pending", requested_by=bo))
        await s.commit()

    async with db() as s:
        out = await add_friend_by_code(s, ada, friend_code(bo))
        await s.commit()
        assert out["status"] == "added"
        assert await _status(s, ada, bo) == "accepted"


@pytest.mark.parametrize(
    ("setup", "code_of", "error"),
    [
        ("none", "self", "invalid"),
        ("blocked", "bo", "forbidden"),
        ("deleted", "bo", "user_not_found"),
        ("none", "bad", "invalid_code"),
    ],
)
async def test_code_refuses(db, setup: str, code_of: str, error: str) -> None:
    async with db() as s:
        ada = await _player(s, "Ada")
        bo = await _player(s, "Bo", status="deleted" if setup == "deleted" else "active")
        if setup == "blocked":
            lo, hi = sorted([ada, bo])
            s.add(Friendship(user_a=lo, user_b=hi, status="blocked", requested_by=bo))
        await s.commit()

    code = {"self": friend_code(ada), "bo": friend_code(bo), "bad": "abc-123"}[code_of]
    async with db() as s:
        with pytest.raises(AppError) as err:
            await add_friend_by_code(s, ada, code)
    assert err.value.code == error
