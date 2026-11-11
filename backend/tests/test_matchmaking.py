"""Unit coverage for online matchmaking (mocked session)."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.common.errors import AppError
from app.modules.matchmaking import service as mm


def _ticket(**kwargs):
    now = datetime.now(UTC)
    defaults = dict(
        id=uuid4(),
        user_id=uuid4(),
        game_key="guess_flag",
        status="searching",
        region=None,
        skill_bucket=None,
        preferred_opponent_id=None,
        match_id=None,
        idempotency_key=None,
        last_heartbeat_at=now,
        created_at=now,
        expires_at=now + timedelta(seconds=20),
        updated_at=now,
    )
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _match(**kwargs):
    now = datetime.now(UTC)
    a, b = uuid4(), uuid4()
    defaults = dict(
        id=uuid4(),
        game_key="guess_flag",
        seed="abc123",
        status="ready",
        player_a_id=a,
        player_b_id=b,
        play_a_id=None,
        play_b_id=None,
        ticket_a_id=None,
        ticket_b_id=None,
        found_at=now,
        ready_at=now + timedelta(seconds=4),
        play_deadline_at=now + timedelta(seconds=184),
        completed_at=None,
        rematch_of_id=None,
        created_at=now,
        updated_at=now,
    )
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


@pytest.mark.asyncio
async def test_require_enabled_raises_when_off():
    with patch("app.modules.matchmaking.service.get_settings") as settings:
        settings.return_value = SimpleNamespace(online_matchmaking_enabled=False)
        with pytest.raises(AppError) as err:
            mm.require_enabled()
        assert err.value.status_code == 404


@pytest.mark.asyncio
async def test_enqueue_rejects_disabled_game():
    session = AsyncMock()
    session.scalar = AsyncMock(side_effect=[None, None])  # no idempotent, no open ticket
    session.get = AsyncMock(return_value=None)
    with (
        patch("app.modules.matchmaking.service.get_settings") as settings,
        patch("app.modules.matchmaking.service.pair_searching_tickets", AsyncMock()),
    ):
        settings.return_value = SimpleNamespace(online_matchmaking_enabled=True)
        with pytest.raises(AppError) as err:
            await mm.enqueue_ticket(session, uuid4(), game_key="nope", idempotency_key="k1")
        assert err.value.status_code == 422


@pytest.mark.asyncio
async def test_attach_play_completes_when_both_submit():
    a, b = uuid4(), uuid4()
    match = _match(player_a_id=a, player_b_id=b, play_a_id=None, play_b_id=uuid4(), status="playing")
    play = SimpleNamespace(id=uuid4(), user_id=a, game_key="guess_flag", seed="abc123", match_id=None)
    session = AsyncMock()
    session.get = AsyncMock(side_effect=[match, None, None, None])
    session.scalar = AsyncMock(return_value=None)
    session.add = MagicMock()
    session.flush = AsyncMock()

    with (
        patch("app.modules.matchmaking.service.get_settings") as settings,
        patch("app.modules.matchmaking.service.enqueue", AsyncMock()) as enq,
        patch("app.modules.matchmaking.service._play_score", AsyncMock(return_value=10)),
        patch("app.modules.matchmaking.service._player", AsyncMock(return_value={"userId": str(a)})),
    ):
        settings.return_value = SimpleNamespace(online_matchmaking_enabled=True)
        # get_match path uses session.get(Match)
        session.get = AsyncMock(return_value=match)
        updated = await mm.attach_play_to_match(session, match_id=match.id, user_id=a, play=play)
        assert updated.play_a_id == play.id
        assert play.match_id == match.id
        assert updated.status == "completed"
        assert enq.await_count >= 1


@pytest.mark.asyncio
async def test_forfeit_open_match():
    user = uuid4()
    match = _match(player_a_id=user, status="ready")
    session = AsyncMock()
    session.get = AsyncMock(return_value=match)
    session.flush = AsyncMock()
    with (
        patch("app.modules.matchmaking.service.get_settings") as settings,
        patch("app.modules.matchmaking.service.enqueue", AsyncMock()),
        patch("app.modules.matchmaking.service.finalize_match_if_needed", AsyncMock()),
    ):
        settings.return_value = SimpleNamespace(online_matchmaking_enabled=True)
        row = await mm.forfeit_match(session, match.id, user)
        assert row.status == "forfeit"


@pytest.mark.asyncio
async def test_cancel_searching_ticket():
    user = uuid4()
    ticket = _ticket(user_id=user, status="searching")
    session = AsyncMock()
    session.get = AsyncMock(return_value=ticket)
    session.flush = AsyncMock()
    with patch("app.modules.matchmaking.service.get_settings") as settings:
        settings.return_value = SimpleNamespace(online_matchmaking_enabled=True)
        row = await mm.cancel_ticket(session, ticket.id, user)
        assert row.status == "cancelled"
