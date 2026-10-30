"""Unit coverage for async friend challenge service (mocked session)."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.common.errors import AppError
from app.modules.challenges import service as challenges


def _friendship(a, b, status="accepted"):
    lo, hi = (a, b) if a < b else (b, a)
    return SimpleNamespace(user_a=lo, user_b=hi, status=status)


def _challenge(**kwargs):
    now = datetime.now(UTC)
    base = dict(
        id=uuid4(),
        challenger_id=uuid4(),
        opponent_id=uuid4(),
        game_key="guess_flag",
        moment_id=None,
        seed="abc123",
        status="pending",
        expires_at=now + timedelta(days=7),
        challenger_play_id=None,
        opponent_play_id=None,
        idempotency_key=None,
        created_at=now,
        updated_at=now,
    )
    base.update(kwargs)
    return SimpleNamespace(**base)


@pytest.mark.asyncio
async def test_create_rejects_non_friends() -> None:
    me, them = uuid4(), uuid4()
    session = AsyncMock()
    session.scalar = AsyncMock(side_effect=[None, None])  # idempotency miss, friendship miss
    session.get = AsyncMock(return_value=SimpleNamespace(status="enabled", title="Flags"))

    with pytest.raises(AppError) as exc:
        await challenges.create_challenge(session, me, them, "guess_flag", idempotency_key="k1")
    assert exc.value.status_code == 403
    assert exc.value.code == "forbidden"


@pytest.mark.asyncio
async def test_create_rejects_disabled_game() -> None:
    me, them = uuid4(), uuid4()
    session = AsyncMock()
    session.scalar = AsyncMock(side_effect=[None, _friendship(me, them)])
    session.get = AsyncMock(return_value=SimpleNamespace(status="disabled", title="Flags"))

    with pytest.raises(AppError) as exc:
        await challenges.create_challenge(session, me, them, "guess_flag", idempotency_key="k1")
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_create_idempotent() -> None:
    me, them = uuid4(), uuid4()
    existing = _challenge(challenger_id=me, opponent_id=them)
    session = AsyncMock()
    session.scalar = AsyncMock(return_value=existing)

    row = await challenges.create_challenge(session, me, them, "guess_flag", idempotency_key="same")
    assert row.id == existing.id
    session.add.assert_not_called()


@pytest.mark.asyncio
async def test_accept_only_opponent() -> None:
    challenger, opponent = uuid4(), uuid4()
    row = _challenge(challenger_id=challenger, opponent_id=opponent, status="pending")
    session = AsyncMock()
    session.get = AsyncMock(return_value=row)

    with pytest.raises(AppError) as exc:
        await challenges.accept_challenge(session, row.id, challenger)
    assert exc.value.status_code == 403

    session.get = AsyncMock(return_value=row)
    updated = await challenges.accept_challenge(session, row.id, opponent)
    assert updated.status == "active"


@pytest.mark.asyncio
async def test_decline_pending() -> None:
    challenger, opponent = uuid4(), uuid4()
    row = _challenge(challenger_id=challenger, opponent_id=opponent, status="pending")
    session = AsyncMock()
    session.get = AsyncMock(return_value=row)

    updated = await challenges.decline_challenge(session, row.id, opponent)
    assert updated.status == "declined"


@pytest.mark.asyncio
async def test_attach_both_plays_completes() -> None:
    challenger, opponent = uuid4(), uuid4()
    row = _challenge(challenger_id=challenger, opponent_id=opponent, status="active")
    play_a = SimpleNamespace(id=uuid4(), user_id=challenger, game_key="guess_flag", seed=None, challenge_id=None)
    play_b = SimpleNamespace(id=uuid4(), user_id=opponent, game_key="guess_flag", seed=None, challenge_id=None)

    session = AsyncMock()
    session.get = AsyncMock(return_value=row)
    session.flush = AsyncMock()

    await challenges.attach_play_to_challenge(session, challenge_id=row.id, user_id=challenger, play=play_a)
    assert row.challenger_play_id == play_a.id
    assert row.status == "active"

    await challenges.attach_play_to_challenge(session, challenge_id=row.id, user_id=opponent, play=play_b)
    assert row.opponent_play_id == play_b.id
    assert row.status == "completed"


@pytest.mark.asyncio
async def test_attach_auto_accepts_for_opponent() -> None:
    challenger, opponent = uuid4(), uuid4()
    row = _challenge(challenger_id=challenger, opponent_id=opponent, status="pending")
    play = SimpleNamespace(id=uuid4(), user_id=opponent, game_key="guess_flag", seed=None, challenge_id=None)
    session = AsyncMock()
    session.get = AsyncMock(return_value=row)
    session.flush = AsyncMock()

    await challenges.attach_play_to_challenge(session, challenge_id=row.id, user_id=opponent, play=play)
    assert row.status == "active"
    assert row.opponent_play_id == play.id


@pytest.mark.asyncio
async def test_serialize_includes_viewer_fields() -> None:
    challenger, opponent = uuid4(), uuid4()
    play_id = uuid4()
    row = _challenge(
        challenger_id=challenger,
        opponent_id=opponent,
        status="completed",
        challenger_play_id=play_id,
        opponent_play_id=None,
    )
    session = AsyncMock()

    async def getter(model, key):
        name = getattr(model, "__name__", "")
        if name == "MiniGame":
            return SimpleNamespace(title="Flag Quiz")
        if name == "GamePlay":
            return SimpleNamespace(score=42) if key == play_id else None
        if name == "Profile":
            return SimpleNamespace(display_name="Ada", avatar_key=None)
        return None

    session.get = AsyncMock(side_effect=getter)
    payload = await challenges.serialize_challenge(session, row, viewer_id=challenger)
    assert payload["role"] == "challenger"
    assert payload["myScore"] == 42
    assert payload["iHavePlayed"] is True
    assert payload["theyHavePlayed"] is False
