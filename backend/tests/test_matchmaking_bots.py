"""Bot fill + bot play unit coverage (mocked session)."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.modules.matchmaking import bots as bot_ops
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
        opponent_is_bot=False,
        created_at=now,
        updated_at=now,
    )
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def test_competitive_score_near_human_higher_is_better():
    scores = [
        bot_ops.competitive_score(
            human_score=100,
            samples=[],
            direction="higher_is_better",
            max_score=10000,
        )
        for _ in range(40)
    ]
    assert all(60 <= s <= 140 for s in scores)
    assert any(s != 100 for s in scores)


def test_competitive_score_samples_when_no_human():
    score = bot_ops.competitive_score(
        human_score=None,
        samples=[12, 34, 56],
        direction="higher_is_better",
        max_score=1000,
    )
    assert score in {12, 34, 56}


@pytest.mark.asyncio
async def test_fill_lonely_ticket_creates_bot_match():
    human = uuid4()
    bot_id = uuid4()
    ticket = _ticket(
        user_id=human,
        created_at=datetime.now(UTC) - timedelta(seconds=6),
    )
    bot_user = SimpleNamespace(id=bot_id, is_bot=True, status="active")

    session = AsyncMock()
    session.scalars = AsyncMock(
        side_effect=[
            MagicMock(__iter__=lambda self: iter([ticket])),  # lonely tickets
        ]
    )
    session.get = AsyncMock(
        side_effect=[
            SimpleNamespace(id=human, is_bot=False),  # human user check
        ]
    )
    session.add = MagicMock()
    session.flush = AsyncMock()

    created_match = _match(
        player_a_id=human,
        player_b_id=bot_id,
        opponent_is_bot=True,
        game_key="guess_flag",
    )

    with (
        patch("app.modules.matchmaking.service.get_settings") as settings,
        patch(
            "app.modules.matchmaking.service._resolve_game_key",
            AsyncMock(return_value="guess_flag"),
        ),
        patch(
            "app.modules.matchmaking.service._create_bot_match",
            AsyncMock(return_value=created_match),
        ) as create_bot,
    ):
        settings.return_value = SimpleNamespace(online_matchmaking_enabled=True)
        filled = await mm.fill_lonely_tickets_with_bots(session, ticket_ids={ticket.id})
        assert filled == 1
        create_bot.assert_awaited_once()


@pytest.mark.asyncio
async def test_pair_prefers_humans_before_bot_fill():
    session = AsyncMock()
    session.scalars = AsyncMock(return_value=MagicMock(__iter__=lambda self: iter([])))
    session.flush = AsyncMock()

    with (
        patch("app.modules.matchmaking.service.get_settings") as settings,
        patch("app.modules.matchmaking.service.fill_lonely_tickets_with_bots", AsyncMock(return_value=0)) as fill,
    ):
        settings.return_value = SimpleNamespace(online_matchmaking_enabled=True)
        # Only one searching human → no human pair, still attempts bot fill.
        a = _ticket()
        session.scalars = AsyncMock(
            side_effect=[
                MagicMock(__iter__=lambda self: iter([])),  # stale
                MagicMock(__iter__=lambda self: iter([a])),  # searching
            ]
        )
        created = await mm.pair_searching_tickets(session)
        assert created == 0
        fill.assert_awaited_once()


@pytest.mark.asyncio
async def test_execute_bot_play_attaches_score():
    human, bot = uuid4(), uuid4()
    match = _match(
        player_a_id=human,
        player_b_id=bot,
        play_a_id=uuid4(),
        play_b_id=None,
        status="playing",
        opponent_is_bot=True,
        seed="seed1",
    )
    human_play = SimpleNamespace(id=match.play_a_id, score=80, duration_ms=25000)

    session = AsyncMock()
    session.get = AsyncMock(
        side_effect=[
            match,
            human_play,  # human play for score
        ]
    )
    session.scalar = AsyncMock(return_value=None)  # no existing bot play

    def _add(obj):
        if getattr(obj, "id", None) is None and hasattr(obj, "score"):
            obj.id = uuid4()

    session.add = MagicMock(side_effect=_add)
    session.flush = AsyncMock()

    with (
        patch("app.modules.matchmaking.service.get_settings") as settings,
        patch(
            "app.modules.matchmaking.service.bot_ops.bot_user_id_for_match",
            AsyncMock(return_value=bot),
        ),
        patch(
            "app.modules.matchmaking.service.bot_ops.resolve_game_scoring",
            AsyncMock(return_value=("higher_is_better", 10000)),
        ),
        patch(
            "app.modules.matchmaking.service.bot_ops.competitive_score",
            return_value=95,
        ),
        patch(
            "app.modules.matchmaking.service.bot_ops.realistic_duration_ms",
            return_value=22000,
        ),
        patch("app.modules.matchmaking.service.finalize_match_if_needed", AsyncMock()),
        patch("app.modules.matchmaking.service._record_event", AsyncMock()),
    ):
        settings.return_value = SimpleNamespace(online_matchmaking_enabled=True)
        ok = await mm.execute_bot_play(session, match.id)
        assert ok is True
        assert match.play_b_id is not None
        session.add.assert_called()


@pytest.mark.asyncio
async def test_attach_human_play_schedules_bot_followup():
    human, bot = uuid4(), uuid4()
    match = _match(
        player_a_id=human,
        player_b_id=bot,
        play_a_id=None,
        play_b_id=None,
        status="ready",
        opponent_is_bot=True,
    )
    play = SimpleNamespace(id=uuid4(), user_id=human, game_key="guess_flag", seed="abc123", match_id=None)
    session = AsyncMock()
    session.get = AsyncMock(return_value=match)
    session.flush = AsyncMock()

    with (
        patch("app.modules.matchmaking.service.get_settings") as settings,
        patch("app.modules.matchmaking.service.finalize_match_if_needed", AsyncMock()),
        patch(
            "app.modules.matchmaking.service.bot_ops.bot_user_id_for_match",
            AsyncMock(return_value=bot),
        ),
        patch("app.modules.matchmaking.service._schedule_bot_play", AsyncMock()) as sched,
    ):
        settings.return_value = SimpleNamespace(online_matchmaking_enabled=True)
        await mm.attach_play_to_match(session, match_id=match.id, user_id=human, play=play)
        sched.assert_awaited_once()
        delay = sched.await_args.kwargs.get("delay")
        assert delay is not None
        assert timedelta(seconds=2) <= delay <= timedelta(seconds=12)


@pytest.mark.asyncio
async def test_rematch_against_bot_reschedules_bot_play():
    human, bot = uuid4(), uuid4()
    prior = _match(
        player_a_id=human,
        player_b_id=bot,
        status="completed",
        opponent_is_bot=True,
    )
    session = AsyncMock()
    session.get = AsyncMock(
        side_effect=[
            prior,  # get_match
            SimpleNamespace(id=bot, is_bot=True),  # opponent user
        ]
    )
    session.scalar = AsyncMock(return_value=None)
    session.add = MagicMock()
    session.flush = AsyncMock()

    with (
        patch("app.modules.matchmaking.service.get_settings") as settings,
        patch("app.modules.matchmaking.service.finalize_match_if_needed", AsyncMock()),
        patch("app.modules.matchmaking.service.enqueue", AsyncMock()),
        patch("app.modules.matchmaking.service._record_event", AsyncMock()),
        patch("app.modules.matchmaking.service._notify_match", AsyncMock()),
        patch("app.modules.matchmaking.service._schedule_bot_play", AsyncMock()) as sched,
    ):
        settings.return_value = SimpleNamespace(online_matchmaking_enabled=True)
        # get_match uses session.get(Match) once
        session.get = AsyncMock(
            side_effect=[prior, SimpleNamespace(id=bot, is_bot=True)]
        )
        row = await mm.rematch(session, prior.id, human, idempotency_key="r1")
        assert row.opponent_is_bot is True
        sched.assert_awaited_once()


@pytest.mark.asyncio
async def test_catch_up_bot_play_runs_after_grace():
    human, bot = uuid4(), uuid4()
    human_play_id = uuid4()
    match = _match(
        player_a_id=human,
        player_b_id=bot,
        play_a_id=human_play_id,
        play_b_id=None,
        status="playing",
        opponent_is_bot=True,
    )
    human_play = SimpleNamespace(
        id=human_play_id,
        score=74,
        duration_ms=20000,
        created_at=datetime.now(UTC) - timedelta(seconds=20),
    )
    session = AsyncMock()
    session.get = AsyncMock(return_value=human_play)

    with (
        patch("app.modules.matchmaking.service.get_settings") as settings,
        patch(
            "app.modules.matchmaking.service.bot_ops.bot_user_id_for_match",
            AsyncMock(return_value=bot),
        ),
        patch("app.modules.matchmaking.service.execute_bot_play", AsyncMock(return_value=True)) as exe,
    ):
        settings.return_value = SimpleNamespace(online_matchmaking_enabled=True)
        ok = await mm.catch_up_bot_play_if_needed(session, match)
        assert ok is True
        exe.assert_awaited_once_with(session, match.id)


@pytest.mark.asyncio
async def test_catch_up_bot_play_waits_for_grace():
    human, bot = uuid4(), uuid4()
    human_play_id = uuid4()
    match = _match(
        player_a_id=human,
        player_b_id=bot,
        play_a_id=human_play_id,
        play_b_id=None,
        status="playing",
        opponent_is_bot=True,
    )
    human_play = SimpleNamespace(
        id=human_play_id,
        score=74,
        duration_ms=20000,
        created_at=datetime.now(UTC) - timedelta(seconds=3),
    )
    session = AsyncMock()
    session.get = AsyncMock(return_value=human_play)

    with (
        patch("app.modules.matchmaking.service.get_settings") as settings,
        patch(
            "app.modules.matchmaking.service.bot_ops.bot_user_id_for_match",
            AsyncMock(return_value=bot),
        ),
        patch("app.modules.matchmaking.service.execute_bot_play", AsyncMock(return_value=True)) as exe,
    ):
        settings.return_value = SimpleNamespace(online_matchmaking_enabled=True)
        ok = await mm.catch_up_bot_play_if_needed(session, match)
        assert ok is False
        exe.assert_not_awaited()


@pytest.mark.asyncio
async def test_catch_up_bot_play_heals_forfeit_without_grace():
    """Deadline finalize used to run before bot catch-up and lock out the bot score."""
    human, bot = uuid4(), uuid4()
    human_play_id = uuid4()
    match = _match(
        player_a_id=human,
        player_b_id=bot,
        play_a_id=human_play_id,
        play_b_id=None,
        status="forfeit",
        opponent_is_bot=True,
    )
    human_play = SimpleNamespace(
        id=human_play_id,
        score=74,
        duration_ms=20000,
        created_at=datetime.now(UTC) - timedelta(seconds=3),
    )
    session = AsyncMock()
    session.get = AsyncMock(return_value=human_play)

    with (
        patch("app.modules.matchmaking.service.get_settings") as settings,
        patch(
            "app.modules.matchmaking.service.bot_ops.bot_user_id_for_match",
            AsyncMock(return_value=bot),
        ),
        patch("app.modules.matchmaking.service.execute_bot_play", AsyncMock(return_value=True)) as exe,
    ):
        settings.return_value = SimpleNamespace(online_matchmaking_enabled=True)
        ok = await mm.catch_up_bot_play_if_needed(session, match)
        assert ok is True
        exe.assert_awaited_once_with(session, match.id)


@pytest.mark.asyncio
async def test_finalize_upgrades_forfeit_when_both_played():
    human, bot = uuid4(), uuid4()
    match = _match(
        player_a_id=human,
        player_b_id=bot,
        play_a_id=uuid4(),
        play_b_id=uuid4(),
        status="forfeit",
        opponent_is_bot=True,
    )
    session = AsyncMock()
    session.flush = AsyncMock()

    with patch("app.modules.matchmaking.service._notify_match", AsyncMock()) as notify:
        await mm.finalize_match_if_needed(session, match)
        assert match.status == "completed"
        notify.assert_awaited_once()


@pytest.mark.asyncio
async def test_serialize_match_omits_bot_flags():
    human, bot = uuid4(), uuid4()
    match = _match(
        player_a_id=human,
        player_b_id=bot,
        opponent_is_bot=True,
        status="ready",
    )
    session = AsyncMock()
    session.get = AsyncMock(
        side_effect=[
            SimpleNamespace(title="Flags"),  # MiniGame
            SimpleNamespace(display_name="You", avatar_key=None),
            SimpleNamespace(display_name="Aarav", avatar_key=None),
            SimpleNamespace(display_name="Aarav", avatar_key=None),  # opponent
        ]
    )
    session.scalar = AsyncMock(return_value=None)

    with (
        patch("app.modules.matchmaking.service.catch_up_bot_play_if_needed", AsyncMock()),
        patch("app.modules.matchmaking.service.finalize_match_if_needed", AsyncMock()),
    ):
        payload = await mm.serialize_match(session, match, viewer_id=human)
        assert "opponentIsBot" not in payload
        assert "isBot" not in payload
        assert "opponent_is_bot" not in payload
        assert payload["opponent"]["displayName"] == "Aarav"
