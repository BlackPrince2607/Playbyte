"""Batched analytics endpoint and Choice crowd aggregation."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.v1.events import MAX_BATCH, EventIn
from app.common.auth import Actor, get_actor
from app.common.security import rate_limiter
from app.infrastructure.postgres.db import get_session
from app.infrastructure.postgres.models import GameEvent
from app.main import create_app
from app.modules.analytics.service import apply_choice_votes, choice_tallies, client_time
from app.modules.content.crowd import CROWD_MIN_VOTES, crowd_attributes, merge_crowd


def _event(**extra) -> dict:
    return {
        "type": "ROUND_STARTED",
        "sessionId": "s1",
        "gameKey": "guess_flag",
        "engineId": "guess",
        "engineVersion": 1,
        "variation": "flag",
        "round": 1,
        "seed": "abc",
        "clockMs": 1200,
        "ts": int(datetime.now(UTC).timestamp() * 1000),
        **extra,
    }


def _pick(session: str, item: str, vote: str, mode: str = "prefer") -> dict:
    return _event(type="ENGINE", name="choice_pick", sessionId=session, props={"item": item, "vote": vote, "side": vote, "mode": mode})


@pytest.fixture
def client():
    app = create_app()
    session = AsyncMock()
    session.add = MagicMock()
    session.get = AsyncMock(return_value=None)
    actor = Actor(kind="guest", guest_id=uuid4())
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_actor] = lambda: actor
    try:
        yield TestClient(app), session
    finally:
        app.dependency_overrides.clear()


def test_post_events_stores_rows(client) -> None:
    http, session = client
    res = http.post("/v1/events", json={"events": [_event(), _event(type="GAME_COMPLETED", props={"score": 40})], "appVersion": "1.2.0"})
    assert res.status_code == 200, res.text
    assert res.json()["accepted"] == 2
    rows = [c.args[0] for c in session.add.call_args_list]
    assert all(isinstance(r, GameEvent) for r in rows)
    assert rows[1].type == "GAME_COMPLETED" and rows[1].props == {"score": 40} and rows[1].app_version == "1.2.0"
    assert rows[0].client_ts is not None


@pytest.mark.parametrize(
    "bad",
    [
        {"events": []},
        {"events": [_event(type="round started")]},
        {"events": [_event(name="Bad Name")]},
        {"events": [_event(sessionId="")]},
        {"events": [_event()] * (MAX_BATCH + 1)},
    ],
)
def test_post_events_rejects_malformed_batches(client, bad: dict) -> None:
    http, _ = client
    assert http.post("/v1/events", json=bad).status_code == 422


def test_post_events_rate_limited(client, monkeypatch) -> None:
    http, _ = client
    monkeypatch.setattr(rate_limiter, "allow", lambda *a, **k: False)
    assert http.post("/v1/events", json={"events": [_event()]}).status_code == 429


def test_oversized_props_are_replaced() -> None:
    e = EventIn(**_event(props={"blob": "x" * 5000}))
    assert e.props == {"truncated": True}


def test_client_time_rejects_implausible_clocks() -> None:
    now = datetime.now(UTC)
    assert client_time(int(now.timestamp() * 1000), now) is not None
    assert client_time(int((now - timedelta(days=30)).timestamp() * 1000), now) is None
    assert client_time(int((now + timedelta(days=3)).timestamp() * 1000), now) is None
    assert client_time(None, now) is None


def test_choice_tallies_count_one_prefer_vote_per_session_and_pair() -> None:
    events = [
        _pick("s1", "choice.chai_coffee", "a"),
        _pick("s1", "choice.chai_coffee", "b"),  # duplicate for the same session: ignored
        _pick("s2", "choice.chai_coffee", "b"),
        _pick("s3", "choice.chai_coffee", "a", mode="predict"),  # a guess about others, not a preference
        _event(type="ENGINE", name="choice_timeout", props={"item": "choice.chai_coffee", "vote": None}),
        _pick("s1", "choice.tea", "x"),
    ]
    assert choice_tallies(events) == {"choice.chai_coffee": [1, 1]}


def test_crowd_split_replaces_editorial_value_only_with_enough_votes() -> None:
    attrs = {"prompt": "?", "split": 68}
    few, changed = crowd_attributes(attrs, 3, 1)
    assert few["split"] == 68 and few["votes"] == 4 and not changed
    many, changed = crowd_attributes(few, 10, CROWD_MIN_VOTES)
    assert many["votes"] == 4 + 10 + CROWD_MIN_VOTES
    assert many["split"] == round(100 * 13 / many["votes"]) and changed


def test_reimport_keeps_live_crowd_data() -> None:
    live = {"split": 41, "crowd": {"a": 41, "b": 59}, "votes": 100}
    merged = merge_crowd({"prompt": "new", "split": 68}, live)
    assert merged == {"prompt": "new", "split": 41, "crowd": {"a": 41, "b": 59}, "votes": 100}
    young = {"split": 68, "crowd": {"a": 2, "b": 1}, "votes": 3}
    assert merge_crowd({"prompt": "new", "split": 70}, young)["split"] == 70
    assert merge_crowd({"split": 70}, None) == {"split": 70}


@pytest.mark.asyncio
async def test_apply_choice_votes_bumps_etag_only_on_visible_change() -> None:
    old = datetime(2026, 1, 1, tzinfo=UTC)
    item = SimpleNamespace(type="choice_pair", status="approved", attributes={"split": 50, "crowd": {"a": 20, "b": 9}, "votes": 29}, updated_at=old)
    draft = SimpleNamespace(type="choice_pair", status="draft", attributes={}, updated_at=old)
    session = AsyncMock()
    session.get = AsyncMock(side_effect=lambda model, key: {"p": item, "d": draft}.get(key))
    now = datetime.now(UTC)

    assert await apply_choice_votes(session, {"p": [1, 0], "d": [1, 0], "missing": [1, 1]}, now) == 1
    assert item.attributes["votes"] == 30 and item.attributes["split"] == 70 and item.updated_at == now
    assert draft.attributes == {}

    item.updated_at = old
    await apply_choice_votes(session, {"p": [1, 0]}, now)
    assert item.attributes["votes"] == 31 and item.attributes["split"] == 71 and item.updated_at == now
