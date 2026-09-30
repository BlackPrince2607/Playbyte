"""Idempotency and concurrency of analytics ingestion against a real Postgres.

Skipped unless TEST_DATABASE_URL points at a disposable database (CI provides one). The tables are
dropped and recreated from the models.
"""

import asyncio
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.common.auth import Actor
from app.infrastructure.postgres.models import (
    ChoiceVote,
    ContentItem,
    GameEvent,
    GuestSession,
    User,
)
from app.modules.analytics.service import record_choice_votes, record_events
from app.modules.content.crowd import CROWD_MIN_VOTES
from app.modules.content.service import upsert_items

DB_URL = os.environ.get("TEST_DATABASE_URL", "")
pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(not DB_URL, reason="TEST_DATABASE_URL not set"),
]

TABLES = [User.__table__, GuestSession.__table__, ContentItem.__table__, GameEvent.__table__, ChoiceVote.__table__]
PAIR = "choice.chai_coffee"


def _url(raw: str) -> str:
    return raw.replace("postgresql://", "postgresql+asyncpg://", 1) if raw.startswith("postgresql://") else raw


@pytest.fixture
async def db():
    engine = create_async_engine(
        _url(DB_URL), pool_size=30, max_overflow=10, connect_args={"server_settings": {"lock_timeout": "15s"}}
    )
    async with engine.begin() as conn:
        await conn.execute(text("DROP TABLE IF EXISTS choice_votes, game_events, content_items, guest_sessions, users CASCADE"))
        await conn.execute(text("DROP TYPE IF EXISTS user_status"))
        await conn.execute(text("CREATE TYPE user_status AS ENUM ('active', 'disabled', 'deleted')"))
        await conn.run_sync(lambda c: ContentItem.metadata.create_all(c, tables=TABLES))
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with factory() as s:
        s.add(ContentItem(id=PAIR, type="choice_pair", status="approved", attributes={"a": "Chai", "b": "Coffee", "split": 68}))
        s.add(ContentItem(id="choice.draft", type="choice_pair", status="draft", attributes={"split": 50}))
        await s.commit()
    try:
        yield factory
    finally:
        await engine.dispose()


async def _guest(factory) -> Actor:
    async with factory() as s:
        g = GuestSession(token_hash=uuid4().hex, expires_at=datetime.now(UTC) + timedelta(days=1))
        s.add(g)
        await s.commit()
        return Actor(kind="guest", guest_id=g.id)


def _event(session_id: str, event_id: str | None = None, **extra) -> dict:
    e = {"type": "ROUND_STARTED", "sessionId": session_id, "gameKey": "this_or_that", "engineId": "choice", "round": 1}
    if event_id:
        e["eventId"] = event_id
    return {**e, **extra}


def _pick(session_id: str, vote: str, event_id: str | None = None, item: str = PAIR) -> dict:
    return _event(session_id, event_id, type="ENGINE", name="choice_pick", props={"item": item, "vote": vote, "mode": "prefer"})


async def _ingest(factory, actor: Actor, events: list[dict]) -> dict:
    async with factory() as s:
        out = await record_events(s, actor, events, "1.0.0")
        await s.commit()
        return out


async def _count(factory, stmt) -> int:
    async with factory() as s:
        return await s.scalar(stmt)


async def _crowd(factory) -> dict:
    async with factory() as s:
        return (await s.get(ContentItem, PAIR)).attributes


async def test_retried_batch_is_stored_once(db) -> None:
    actor = await _guest(db)
    batch = [_event("s1", "s1-evt-0001"), _event("s1", "s1-evt-0002", type="GAME_COMPLETED")]
    first = await _ingest(db, actor, batch)
    retry = await _ingest(db, actor, batch)
    assert first["duplicates"] == 0 and retry == {"accepted": 2, "duplicates": 2, "choicePairsUpdated": 0}
    assert await _count(db, select(func.count()).select_from(GameEvent)) == 2


async def test_duplicate_ids_inside_one_batch_are_stored_once(db) -> None:
    actor = await _guest(db)
    out = await _ingest(db, actor, [_event("s1", "s1-evt-0001"), _event("s1", "s1-evt-0001")])
    assert out["duplicates"] == 1
    assert await _count(db, select(func.count()).select_from(GameEvent)) == 1


async def test_events_without_ids_keep_the_old_behaviour(db) -> None:
    actor = await _guest(db)
    await _ingest(db, actor, [_event("s1")])
    await _ingest(db, actor, [_event("s1")])
    assert await _count(db, select(func.count()).select_from(GameEvent)) == 2


async def test_same_event_id_in_another_session_is_distinct(db) -> None:
    actor = await _guest(db)
    await _ingest(db, actor, [_event("s1", "evt-00000001"), _event("s2", "evt-00000001")])
    assert await _count(db, select(func.count()).select_from(GameEvent)) == 2


async def test_replayed_vote_counts_once(db) -> None:
    actor = await _guest(db)
    await _ingest(db, actor, [_pick("s1", "a", "s1-pick-0001")])
    replay = await _ingest(db, actor, [_pick("s1", "a", "s1-pick-0001")])
    assert replay["choicePairsUpdated"] == 0
    assert (await _crowd(db))["crowd"] == {"a": 1, "b": 0}


async def test_one_vote_per_session_and_pair_across_batches(db) -> None:
    actor = await _guest(db)
    await _ingest(db, actor, [_pick("s1", "a", "s1-pick-0001")])
    await _ingest(db, actor, [_pick("s1", "b", "s1-pick-0002")])  # different event, same session and pair
    await _ingest(db, actor, [_pick("s1", "b")])  # older client, no event id
    assert (await _crowd(db))["crowd"] == {"a": 1, "b": 0}
    assert await _count(db, select(func.count()).select_from(ChoiceVote)) == 1


async def test_votes_for_unknown_or_unapproved_pairs_are_ignored(db) -> None:
    actor = await _guest(db)
    out = await _ingest(db, actor, [_pick("s1", "a", item="choice.missing"), _pick("s2", "a", item="choice.draft")])
    assert out["choicePairsUpdated"] == 0
    assert await _count(db, select(func.count()).select_from(ChoiceVote)) == 0


async def test_editorial_split_until_threshold_then_measured(db) -> None:
    actor = await _guest(db)
    await _ingest(db, actor, [_pick(f"s{i}", "a") for i in range(CROWD_MIN_VOTES - 1)])
    attrs = await _crowd(db)
    assert attrs["votes"] == CROWD_MIN_VOTES - 1 and attrs["split"] == 68
    await _ingest(db, actor, [_pick("last", "b")])
    attrs = await _crowd(db)
    assert attrs["votes"] == CROWD_MIN_VOTES
    assert attrs["split"] == round(100 * (CROWD_MIN_VOTES - 1) / CROWD_MIN_VOTES)


async def test_a_second_request_waits_for_the_first_and_sees_its_vote(db) -> None:
    actor = await _guest(db)
    now = datetime.now(UTC)

    async def second() -> None:
        async with db() as s:
            await record_choice_votes(s, actor, [(PAIR, "s2", "b")], now)
            await s.commit()

    async with db() as first:
        await record_choice_votes(first, actor, [(PAIR, "s1", "a")], now)  # holds the row lock, uncommitted
        task = asyncio.create_task(second())
        await asyncio.sleep(0.5)
        blocked = not task.done()
        await first.commit()
    await asyncio.wait_for(task, 10)
    assert blocked, "second request did not wait for the row lock"
    assert (await _crowd(db))["crowd"] == {"a": 1, "b": 1}


def _import_row(split: int) -> dict:
    return {
        "id": PAIR, "type": "choice_pair", "schemaVersion": 1, "locale": "en-IN", "categories": [], "tags": [],
        "difficulty": 0.5, "popularity": 0.5, "answer": None, "aliases": [],
        "attributes": {"a": "Chai", "b": "Coffee", "split": split}, "media": [], "facts": [], "hints": [],
        "distractorGroup": None, "source": None, "status": "approved", "version": 2,
    }  # fmt: skip


async def test_reimport_waits_for_an_open_vote_and_keeps_it(db) -> None:
    actor = await _guest(db)

    async def reimport() -> None:
        async with db() as s:
            await upsert_items(s, [_import_row(55)])
            await s.commit()

    async with db() as voting:
        await record_choice_votes(voting, actor, [(PAIR, "s1", "a")], datetime.now(UTC))
        task = asyncio.create_task(reimport())
        await asyncio.sleep(0.5)
        blocked = not task.done()
        await voting.commit()
    await asyncio.wait_for(task, 10)
    assert blocked, "importer did not wait for the row lock"
    attrs = await _crowd(db)
    assert attrs["crowd"] == {"a": 1, "b": 0} and attrs["votes"] == 1
    assert attrs["split"] == 55  # editorial value still applies below the threshold


async def test_concurrent_votes_are_all_counted(db) -> None:
    actor = await _guest(db)
    n = 25
    await asyncio.gather(*(_ingest(db, actor, [_pick(f"s{i}", "a" if i % 3 else "b")]) for i in range(n)))
    attrs = await _crowd(db)
    b = len([i for i in range(n) if i % 3 == 0])
    assert attrs["crowd"] == {"a": n - b, "b": b} and attrs["votes"] == n
    assert await _count(db, select(func.count()).select_from(ChoiceVote)) == n
