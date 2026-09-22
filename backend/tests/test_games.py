"""Edge-case coverage for mini-game play submission."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from app.api.v1.games import PlayIn
from app.common.auth import Actor
from app.common.errors import AppError
from app.modules.games.scoring import clamp_score, percentile
from app.modules.games.service import submit_play


def test_play_in_allows_two_hour_endless_session() -> None:
    body = PlayIn(score=12, durationMs=7_200_000)
    assert body.durationMs == 7_200_000


def test_play_in_rejects_over_two_hours() -> None:
    with pytest.raises(ValidationError):
        PlayIn(score=1, durationMs=7_200_001)


def test_play_in_rejects_negative_score() -> None:
    with pytest.raises(ValidationError):
        PlayIn(score=-1, durationMs=1000)


def test_clamp_and_percentile_edges() -> None:
    assert clamp_score(-5, 40) == 0
    assert clamp_score(999, 40) == 40
    assert percentile(10, []) == 50.0
    assert percentile(5, [5, 5, 5]) == 0.0
    assert percentile(10, [1, 2, 3]) == 100.0


def _actor(kind: str = "guest") -> Actor:
    if kind == "guest":
        return Actor(kind="guest", user_id=None, guest_id=uuid4(), engagements=0)
    return Actor(kind="user", user_id=uuid4(), guest_id=None, engagements=0)


def _session_for_game(game: SimpleNamespace | None) -> AsyncMock:
    session = AsyncMock()
    session.get = AsyncMock(side_effect=lambda model, key: game if model.__name__ == "MiniGame" else None)
    session.scalar = AsyncMock(return_value=None)
    session.scalars = AsyncMock(return_value=[])
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.rollback = AsyncMock()
    return session


@pytest.mark.asyncio
async def test_submit_play_missing_game() -> None:
    session = _session_for_game(None)
    with pytest.raises(AppError) as exc:
        await submit_play(session, _actor(), "missing", 10, 1000, "k1")
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_submit_play_disabled_game() -> None:
    game = SimpleNamespace(key="x", status="disabled", config={"maxScore": 100})
    session = _session_for_game(game)
    with pytest.raises(AppError) as exc:
        await submit_play(session, _actor(), "x", 10, 1000, "k1")
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_submit_play_clamps_score_and_duration() -> None:
    game = SimpleNamespace(key="color_match", status="enabled", config={"maxScore": 40})
    session = _session_for_game(game)
    play_id = uuid4()

    def add_play(obj: object) -> None:
        obj.id = play_id  # type: ignore[attr-defined]

    session.add = MagicMock(side_effect=add_play)

    with (
        patch("app.modules.games.service.game_stats", AsyncMock(return_value={"playsToday": 1, "averageScore": 40.0, "percentile": 100.0})),
        patch("app.modules.games.service._prompt", return_value=False),
    ):
        result = await submit_play(session, _actor(), "color_match", 999, 9_000_000, "idem-1")

    assert result["score"] == 40
    assert result["created"] is True
    added = session.add.call_args[0][0]
    assert added.duration_ms == 7_200_000
    assert added.score == 40


@pytest.mark.asyncio
async def test_submit_play_idempotent_replay() -> None:
    game = SimpleNamespace(key="frenzy_tap", status="enabled", config={"maxScore": 2000})
    existing = SimpleNamespace(id=uuid4(), score=42)
    session = _session_for_game(game)
    session.scalar = AsyncMock(return_value=existing)

    with (
        patch("app.modules.games.service.game_stats", AsyncMock(return_value={"playsToday": 3, "averageScore": 20.0, "percentile": 80.0})),
        patch("app.modules.games.service._prompt", return_value=False),
    ):
        result = await submit_play(session, _actor(), "frenzy_tap", 99, 5000, "same-key")

    assert result["created"] is False
    assert result["score"] == 42
    assert result["playId"] == str(existing.id)
    session.add.assert_not_called()


@pytest.mark.asyncio
async def test_submit_play_integrity_error_replays_existing() -> None:
    game = SimpleNamespace(key="lane_dash", status="enabled", config={"maxScore": 1000000})
    existing = SimpleNamespace(id=uuid4(), score=17)
    session = _session_for_game(game)
    session.flush = AsyncMock(side_effect=IntegrityError("dup", {}, None))
    session.scalar = AsyncMock(side_effect=[None, existing])

    with (
        patch("app.modules.games.service.game_stats", AsyncMock(return_value={"playsToday": 1, "averageScore": 17.0, "percentile": 50.0})),
        patch("app.modules.games.service._prompt", return_value=False),
    ):
        result = await submit_play(session, _actor(), "lane_dash", 17, 1200, "race-key")

    assert result["created"] is False
    assert result["score"] == 17
    session.rollback.assert_awaited()
