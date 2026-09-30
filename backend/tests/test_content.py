"""Content pipeline, pack endpoint and Game Engine SDK play metadata."""

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.api.v1.games import PlayIn
from app.common.auth import Actor
from app.common.errors import AppError
from app.modules.content.service import compute_etag
from app.modules.content.validation import ContentValidationError, validate_item, validate_items
from app.modules.games.scoring import min_plausible_duration_ms, percentile
from app.modules.games.service import catalog_entry, submit_play


def _item(item_id: str, **extra) -> dict:
    return {"id": item_id, "type": "flag", "answer": f"Answer {item_id}", "difficulty": 0.2, "status": "approved", **extra}


def test_validate_item_normalises_defaults() -> None:
    out = validate_item(_item("in", media=[{"kind": "emoji", "value": "🇮🇳"}]))
    assert out["locale"] == "en-IN"
    assert out["popularity"] == 0.5
    assert out["media"][0]["value"] == "🇮🇳"


@pytest.mark.parametrize(
    "extra",
    [
        {"difficulty": 1.5},
        {"media": [{"kind": "image", "url": "http://insecure/x.png"}]},
        {"hints": ["this is shit"]},
        {"answer": "India", "attributes": {"distractors": ["Nepal", " INDIA"]}},
        {"facts": [{"text": "tiny", "isTrue": True}]},
        {"status": "live"},
    ],
)
def test_validate_item_rejects(extra: dict) -> None:
    with pytest.raises(ContentValidationError):
        validate_item(_item("x", **extra))


def test_blocklist_matches_whole_words_only() -> None:
    validate_item(_item("x", answer="Scunthorpe shitake"))


def test_validate_items_reports_duplicates_and_errors() -> None:
    items, errors = validate_items([_item("a"), _item("a"), {"id": "BAD"}])
    assert [i["id"] for i in items] == ["a"]
    assert len(errors) == 2


def test_etag_changes_with_content() -> None:
    t = datetime(2026, 1, 1, tzinfo=UTC)
    a = compute_etag("flag", 10, t, 10, None)
    assert a == compute_etag("flag", 10, t, 10, None)
    assert a != compute_etag("flag", 11, t, 11, None)
    assert a.startswith('"') and a.endswith('"')


def test_bundled_packs_validate() -> None:
    from scripts.import_content import DEFAULT_DIR, main

    if not list(DEFAULT_DIR.glob("*.json")):
        pytest.skip("no bundled packs yet")
    assert main(["--dry-run"]) == 0


def test_percentile_respects_direction() -> None:
    assert percentile(10, [5, 20, 30]) == 33.3
    assert percentile(10, [5, 20, 30], lower_is_better=True) == 66.7


def test_play_in_meta_only_for_sdk_plays() -> None:
    assert PlayIn(score=1, durationMs=1000).meta() is None
    body = PlayIn(
        score=40,
        durationMs=20_000,
        engine="guess",
        variation="flag",
        engineVersion=1,
        seed="abc",
        level=0.4567,
        summary={"correct": 4, "attempts": 5, "breakdown": {"base": 40}},
    )
    meta = body.meta()
    assert meta["engine"] == "guess"
    assert meta["summary"] == {"correct": 4, "attempts": 5, "breakdown": {"base": 40}, "level": 0.457}


def test_catalog_entry_includes_engine_fields() -> None:
    legacy = SimpleNamespace(key="k", title="t", blurb="b", config={}, engine=None, variation=None, config_version=1, score_direction="higher_is_better")
    assert "engine" not in catalog_entry(legacy)
    sdk = SimpleNamespace(key="guess_flag", title="t", blurb="b", config={}, engine="guess", variation="flag", config_version=2, score_direction="lower_is_better")
    e = catalog_entry(sdk)
    assert (e["engine"], e["variation"], e["configVersion"], e["scoreDirection"]) == ("guess", "flag", 2, "lower_is_better")


def _actor() -> Actor:
    return Actor(kind="guest", user_id=None, guest_id=uuid4(), engagements=0)


def _session(game: SimpleNamespace, scalar_values: list) -> AsyncMock:
    session = AsyncMock()
    session.get = AsyncMock(side_effect=lambda model, key: game if model.__name__ == "MiniGame" else None)
    session.scalar = AsyncMock(side_effect=scalar_values)
    session.add = MagicMock(side_effect=lambda obj: setattr(obj, "id", uuid4()))
    session.flush = AsyncMock()
    return session


def _game() -> SimpleNamespace:
    return SimpleNamespace(key="guess_flag", status="enabled", config={"maxScore": 300}, engine="guess", variation="flag", config_version=3, score_direction="higher_is_better")


@pytest.mark.asyncio
async def test_submit_play_stores_sdk_metadata() -> None:
    session = _session(_game(), [None, 0])
    meta = {"engine": "guess", "variation": "flag", "engine_version": 1, "seed": "s1", "summary": {"attempts": 10}}
    with (
        patch("app.modules.games.service.game_stats", AsyncMock(return_value={"playsToday": 1, "averageScore": 1.0, "percentile": 50.0})),
        patch("app.modules.games.service._prompt", return_value=False),
    ):
        res = await submit_play(session, _actor(), "guess_flag", 120, 30_000, "k", meta=meta)
    assert res["created"] is True
    play = session.add.call_args[0][0]
    assert (play.engine, play.variation, play.seed, play.engine_version, play.config_version) == ("guess", "flag", "s1", 1, 3)
    assert play.summary == {"attempts": 10}


@pytest.mark.asyncio
async def test_submit_play_rejects_implausibly_fast_sdk_play() -> None:
    session = _session(_game(), [None, 0])
    meta = {"engine": "guess", "summary": {"attempts": 10}}
    assert min_plausible_duration_ms(10) == 2500
    with pytest.raises(AppError) as exc:
        await submit_play(session, _actor(), "guess_flag", 120, 1_000, "k", meta=meta)
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_submit_play_rate_limited() -> None:
    session = _session(_game(), [None, 30])
    with pytest.raises(AppError) as exc:
        await submit_play(session, _actor(), "guess_flag", 10, 30_000, "k")
    assert exc.value.status_code == 429
