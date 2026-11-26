from __future__ import annotations

import random
import secrets
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import and_, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors import AppError
from app.config import get_settings
from app.infrastructure.postgres.models import (
    Friendship,
    GamePlay,
    Match,
    MatchEvent,
    MatchmakingTicket,
    MiniGame,
    Profile,
    User,
)
from app.infrastructure.queue.outbox import enqueue
from app.modules.matchmaking import bots as bot_ops
from app.modules.matchmaking.categories import is_known_category, pool_for

SEARCH_TTL = timedelta(seconds=20)
SEARCH_EXTEND = timedelta(seconds=20)
HEARTBEAT_STALE = timedelta(seconds=15)
BOT_FILL_AFTER = timedelta(seconds=5)
# After the human submits, give the delayed outbox job a beat — then finish inline.
BOT_PLAY_CATCHUP_AFTER = timedelta(seconds=12)
COUNTDOWN = timedelta(seconds=4)
PLAY_WINDOW = timedelta(seconds=180)
OPEN_MATCH = ("ready", "playing")


def require_enabled() -> None:
    if not get_settings().online_matchmaking_enabled:
        raise AppError("disabled", "Online matchmaking is not available.", 404)


def _new_seed() -> str:
    return secrets.token_hex(8)


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _ordered(a: UUID, b: UUID) -> tuple[UUID, UUID]:
    return (a, b) if a < b else (b, a)


async def _player(session: AsyncSession, user_id: UUID) -> dict:
    profile = await session.get(Profile, user_id)
    return {
        "userId": str(user_id),
        "displayName": profile.display_name if profile else "Player",
        "avatarKey": profile.avatar_key if profile else None,
    }


async def _play_score(session: AsyncSession, play_id: UUID | None) -> int | None:
    if play_id is None:
        return None
    play = await session.get(GamePlay, play_id)
    return play.score if play else None


async def _blocked(session: AsyncSession, a: UUID, b: UUID) -> bool:
    lo, hi = _ordered(a, b)
    row = await session.scalar(
        select(Friendship).where(
            Friendship.user_a == lo,
            Friendship.user_b == hi,
            Friendship.status == "blocked",
        )
    )
    return row is not None


async def _record_event(session: AsyncSession, match_id: UUID, kind: str, payload: dict) -> None:
    session.add(MatchEvent(match_id=match_id, kind=kind, payload=payload))


async def _notify_match(session: AsyncSession, match: Match, event: str) -> None:
    payload = {
        "event": event,
        "matchId": str(match.id),
        "gameKey": match.game_key,
        "seed": match.seed,
        "status": match.status,
        "readyAt": _iso(match.ready_at),
        "playDeadlineAt": _iso(match.play_deadline_at),
    }
    for uid in (match.player_a_id, match.player_b_id):
        await enqueue(
            session,
            "match.notify",
            {"userId": str(uid), "event": event, "payload": payload},
        )


async def serialize_match(
    session: AsyncSession,
    match: Match,
    *,
    viewer_id: UUID | None = None,
) -> dict:
    # Polling clients (result screen) heal stuck bot matches even if the worker is down.
    await catch_up_bot_play_if_needed(session, match)
    await finalize_match_if_needed(session, match)
    game = await session.get(MiniGame, match.game_key)
    score_a = await _play_score(session, match.play_a_id)
    score_b = await _play_score(session, match.play_b_id)
    now = datetime.now(UTC)
    countdown = 0
    if match.ready_at and match.status in OPEN_MATCH and match.ready_at > now:
        countdown = max(0, int((match.ready_at - now).total_seconds()))
    payload = {
        "id": str(match.id),
        "status": match.status,
        "gameKey": match.game_key,
        "gameTitle": game.title if game else match.game_key,
        "gameBlurb": getattr(game, "blurb", "") if game else "",
        "seed": match.seed,
        "foundAt": _iso(match.found_at),
        "readyAt": _iso(match.ready_at),
        "playDeadlineAt": _iso(match.play_deadline_at),
        "completedAt": _iso(match.completed_at),
        "countdownSeconds": countdown,
        "playerA": await _player(session, match.player_a_id),
        "playerB": await _player(session, match.player_b_id),
        "scoreA": score_a,
        "scoreB": score_b,
        "rematchOfId": str(match.rematch_of_id) if match.rematch_of_id else None,
    }
    # Clients need engine/variation to launch without relying on a feed-cache hit.
    if game is not None:
        if getattr(game, "engine", None):
            payload["engine"] = game.engine
            payload["variation"] = getattr(game, "variation", None)
        cfg = getattr(game, "config", None)
        if cfg:
            payload["config"] = cfg
    if viewer_id is not None:
        if viewer_id == match.player_a_id:
            my_play, their_play = match.play_a_id, match.play_b_id
            opponent_id = match.player_b_id
            my_score, their_score = score_a, score_b
            role = "a"
        elif viewer_id == match.player_b_id:
            my_play, their_play = match.play_b_id, match.play_a_id
            opponent_id = match.player_a_id
            my_score, their_score = score_b, score_a
            role = "b"
        else:
            raise AppError("forbidden", "You're not part of this match.", 403)
        payload["role"] = role
        payload["opponent"] = await _player(session, opponent_id)
        payload["myScore"] = my_score
        payload["theirScore"] = their_score
        payload["iHavePlayed"] = my_play is not None
        payload["theyHavePlayed"] = their_play is not None
    return payload


async def serialize_ticket(
    session: AsyncSession,
    ticket: MatchmakingTicket,
) -> dict:
    await expire_ticket_if_needed(session, ticket)
    payload = {
        "id": str(ticket.id),
        "status": ticket.status,
        "gameKey": ticket.game_key,
        "category": ticket.category,
        "createdAt": _iso(ticket.created_at),
        "expiresAt": _iso(ticket.expires_at),
        "matchId": str(ticket.match_id) if ticket.match_id else None,
        "code": None,
    }
    if ticket.status == "expired":
        payload["code"] = "no_opponent"
    if ticket.match_id:
        match = await session.get(Match, ticket.match_id)
        if match:
            payload["match"] = await serialize_match(session, match, viewer_id=ticket.user_id)
    return payload


async def expire_ticket_if_needed(session: AsyncSession, ticket: MatchmakingTicket) -> None:
    if ticket.status != "searching":
        return
    now = datetime.now(UTC)
    stale = ticket.last_heartbeat_at and (now - ticket.last_heartbeat_at) > HEARTBEAT_STALE
    if stale:
        ticket.status = "expired"
        ticket.updated_at = now
        await session.flush()
        return
    # Prefer bot fill over a cold-queue expire once the 5s window has passed.
    if now - ticket.created_at >= BOT_FILL_AFTER:
        filled = await fill_lonely_tickets_with_bots(session, ticket_ids={ticket.id})
        if filled:
            await session.refresh(ticket)
            return
    if ticket.expires_at <= now:
        ticket.status = "expired"
        ticket.updated_at = now
        await session.flush()


async def finalize_match_if_needed(session: AsyncSession, match: Match) -> None:
    now = datetime.now(UTC)
    prev = match.status
    # Heal forfeits that later gained both plays (e.g. bot catch-up after a deadline race).
    if match.play_a_id and match.play_b_id and match.status in (*OPEN_MATCH, "forfeit"):
        match.status = "completed"
        match.completed_at = now
        match.updated_at = now
        await session.flush()
        if prev != match.status:
            await _notify_match(session, match, "match.result")
        return
    if match.status not in OPEN_MATCH:
        return
    if match.play_deadline_at and match.play_deadline_at <= now:
        match.status = "forfeit" if (match.play_a_id or match.play_b_id) else "expired"
        match.completed_at = now
        match.updated_at = now
        await session.flush()
        if prev != match.status:
            await _notify_match(session, match, "match.result")


async def _enabled_game_keys(session: AsyncSession, keys: list[str] | None = None) -> list[str]:
    stmt = select(MiniGame.key).where(MiniGame.status == "enabled")
    if keys is not None:
        if not keys:
            return []
        stmt = stmt.where(MiniGame.key.in_(keys))
    stmt = stmt.order_by(MiniGame.sort_order)
    return list(await session.scalars(stmt))


def _queue_bucket(ticket: MatchmakingTicket) -> str:
    """Tickets in the same bucket can be paired. Category queues stay together even when game_key is null."""
    if ticket.game_key:
        return f"game:{ticket.game_key}"
    if ticket.category:
        return f"cat:{ticket.category}"
    return "cat:mixed"


async def enqueue_ticket(
    session: AsyncSession,
    user_id: UUID,
    *,
    game_key: str | None,
    idempotency_key: str | None,
    preferred_opponent_id: UUID | None = None,
    extend_existing: bool = False,
    category: str | None = None,
) -> MatchmakingTicket:
    require_enabled()
    if idempotency_key:
        existing = await session.scalar(
            select(MatchmakingTicket).where(
                MatchmakingTicket.user_id == user_id,
                MatchmakingTicket.idempotency_key == idempotency_key,
            )
        )
        if existing:
            return existing

    cat = (category or "").strip().lower() or None
    if cat and not is_known_category(cat):
        raise AppError("invalid", "Unknown matchmaking category.", 422)

    # Category queues own the bucket; concrete game_key is only for legacy / friend-specific searches.
    if cat:
        game_key = None
        pool = pool_for(cat)
        if pool:
            enabled = await _enabled_game_keys(session, list(pool))
            if not enabled:
                raise AppError("unsupported_game", "That category has no playable games right now.", 422)
    elif game_key:
        game = await session.get(MiniGame, game_key)
        if game is None or game.status != "enabled":
            raise AppError("unsupported_game", "That game can't be matched right now.", 422)

    open_ticket = await session.scalar(
        select(MatchmakingTicket).where(
            MatchmakingTicket.user_id == user_id,
            MatchmakingTicket.status == "searching",
        )
    )
    if open_ticket:
        await expire_ticket_if_needed(session, open_ticket)
        if open_ticket.status == "searching":
            if extend_existing:
                open_ticket.expires_at = datetime.now(UTC) + SEARCH_EXTEND
                open_ticket.last_heartbeat_at = datetime.now(UTC)
                open_ticket.updated_at = datetime.now(UTC)
                await session.flush()
                return open_ticket
            raise AppError("conflict", "You're already searching for a match.", 409)

    now = datetime.now(UTC)
    ticket = MatchmakingTicket(
        user_id=user_id,
        game_key=game_key,
        category=cat,
        status="searching",
        preferred_opponent_id=preferred_opponent_id,
        idempotency_key=idempotency_key,
        last_heartbeat_at=now,
        expires_at=now + SEARCH_TTL,
    )
    session.add(ticket)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        if idempotency_key:
            existing = await session.scalar(
                select(MatchmakingTicket).where(
                    MatchmakingTicket.user_id == user_id,
                    MatchmakingTicket.idempotency_key == idempotency_key,
                )
            )
            if existing:
                return existing
        raise AppError("conflict", "Could not join matchmaking.", 409) from None

    await pair_searching_tickets(session)
    await session.refresh(ticket)
    return ticket


async def cancel_ticket(session: AsyncSession, ticket_id: UUID, user_id: UUID) -> MatchmakingTicket:
    require_enabled()
    ticket = await session.get(MatchmakingTicket, ticket_id)
    if ticket is None or ticket.user_id != user_id:
        raise AppError("not_found", "Ticket not found.", 404)
    if ticket.status == "cancelled":
        return ticket
    if ticket.status != "searching":
        raise AppError("conflict", "This search is no longer open.", 409)
    ticket.status = "cancelled"
    ticket.updated_at = datetime.now(UTC)
    await session.flush()
    return ticket


async def get_ticket(session: AsyncSession, ticket_id: UUID, user_id: UUID) -> MatchmakingTicket:
    require_enabled()
    ticket = await session.get(MatchmakingTicket, ticket_id)
    if ticket is None or ticket.user_id != user_id:
        raise AppError("not_found", "Ticket not found.", 404)
    await expire_ticket_if_needed(session, ticket)
    return ticket


async def heartbeat(session: AsyncSession, user_id: UUID, ticket_id: UUID | None = None) -> dict:
    require_enabled()
    now = datetime.now(UTC)
    stmt = select(MatchmakingTicket).where(
        MatchmakingTicket.user_id == user_id,
        MatchmakingTicket.status == "searching",
    )
    if ticket_id:
        stmt = stmt.where(MatchmakingTicket.id == ticket_id)
    rows = list(await session.scalars(stmt))
    for row in rows:
        row.last_heartbeat_at = now
        row.updated_at = now
    await session.flush()
    return {"ok": True, "updated": len(rows)}


async def _schedule_bot_play(
    session: AsyncSession,
    match: Match,
    *,
    delay: timedelta | None = None,
) -> None:
    if not match.opponent_is_bot:
        return
    ready_at = match.ready_at or match.found_at or datetime.now(UTC)
    if delay is None:
        delay = timedelta(seconds=random.randint(18, 75))
    run_at = ready_at + delay
    # If the countdown already passed, schedule from now.
    now = datetime.now(UTC)
    if run_at < now:
        run_at = now + delay
    await enqueue(
        session,
        "match.bot_play",
        {"matchId": str(match.id)},
        run_at=run_at,
    )


async def _create_match(
    session: AsyncSession,
    a: MatchmakingTicket,
    b: MatchmakingTicket,
    game_key: str,
    *,
    rematch_of_id: UUID | None = None,
    opponent_is_bot: bool = False,
) -> Match:
    now = datetime.now(UTC)
    ready_at = now + COUNTDOWN
    player_a, player_b = a.user_id, b.user_id
    match = Match(
        game_key=game_key,
        seed=_new_seed(),
        status="ready",
        player_a_id=player_a,
        player_b_id=player_b,
        ticket_a_id=a.id,
        ticket_b_id=b.id,
        found_at=now,
        ready_at=ready_at,
        play_deadline_at=ready_at + PLAY_WINDOW,
        rematch_of_id=rematch_of_id,
        opponent_is_bot=opponent_is_bot,
    )
    session.add(match)
    await session.flush()
    for ticket in (a, b):
        ticket.status = "matched"
        ticket.match_id = match.id
        ticket.updated_at = now
    await _record_event(
        session,
        match.id,
        "found",
        {
            "playerA": str(player_a),
            "playerB": str(player_b),
            "gameKey": game_key,
            "bot": opponent_is_bot,
        },
    )
    await _notify_match(session, match, "match.found")
    await enqueue(
        session,
        "match.ready",
        {"matchId": str(match.id), "readyAt": _iso(ready_at)},
    )
    if opponent_is_bot:
        await _schedule_bot_play(session, match)
    await session.flush()
    return match


async def _resolve_game_key(
    session: AsyncSession,
    ticket: MatchmakingTicket,
    *,
    popular: str | None = None,
) -> str | None:
    """Pick the concrete mini_game for a match. Category tickets rotate across their pool."""
    if ticket.game_key:
        return ticket.game_key
    pool = pool_for(ticket.category)
    if pool:
        enabled = await _enabled_game_keys(session, list(pool))
        if enabled:
            return random.choice(enabled)
    if popular:
        return popular
    enabled = await _enabled_game_keys(session)
    return random.choice(enabled) if enabled else None


async def _create_bot_match(
    session: AsyncSession,
    ticket: MatchmakingTicket,
    *,
    game_key: str,
) -> Match | None:
    bot = await bot_ops.pick_bot_opponent(session, ticket.user_id)
    if bot is None:
        return None
    now = datetime.now(UTC)
    ready_at = now + COUNTDOWN
    match = Match(
        game_key=game_key,
        seed=_new_seed(),
        status="ready",
        player_a_id=ticket.user_id,
        player_b_id=bot.id,
        ticket_a_id=ticket.id,
        ticket_b_id=None,
        found_at=now,
        ready_at=ready_at,
        play_deadline_at=ready_at + PLAY_WINDOW,
        opponent_is_bot=True,
    )
    session.add(match)
    await session.flush()
    ticket.status = "matched"
    ticket.match_id = match.id
    ticket.updated_at = now
    await _record_event(
        session,
        match.id,
        "found",
        {
            "playerA": str(ticket.user_id),
            "playerB": str(bot.id),
            "gameKey": game_key,
            "bot": True,
        },
    )
    await _notify_match(session, match, "match.found")
    await enqueue(
        session,
        "match.ready",
        {"matchId": str(match.id), "readyAt": _iso(ready_at)},
    )
    await _schedule_bot_play(session, match)
    await session.flush()
    return match


async def fill_lonely_tickets_with_bots(
    session: AsyncSession,
    *,
    ticket_ids: set[UUID] | None = None,
    limit: int = 40,
) -> int:
    """Match searching humans who waited BOT_FILL_AFTER with a bot opponent."""
    if not get_settings().online_matchmaking_enabled:
        return 0
    now = datetime.now(UTC)
    cutoff = now - BOT_FILL_AFTER
    stmt = (
        select(MatchmakingTicket)
        .where(
            MatchmakingTicket.status == "searching",
            MatchmakingTicket.created_at <= cutoff,
            MatchmakingTicket.last_heartbeat_at >= now - HEARTBEAT_STALE,
        )
        .order_by(MatchmakingTicket.created_at)
        .with_for_update(skip_locked=True)
        .limit(limit)
    )
    if ticket_ids is not None:
        stmt = stmt.where(MatchmakingTicket.id.in_(ticket_ids))
    rows = list(await session.scalars(stmt))
    if not rows:
        return 0

    concrete_counts: dict[str, int] = defaultdict(int)
    for t in rows:
        if t.game_key:
            concrete_counts[t.game_key] += 1
    popular = max(concrete_counts, key=concrete_counts.get) if concrete_counts else None

    filled = 0
    for ticket in rows:
        # Skip bots in the queue (synthetic fill tickets should already be matched).
        user = await session.get(User, ticket.user_id)
        if user and user.is_bot:
            continue
        game_key = await _resolve_game_key(session, ticket, popular=popular)
        if not game_key:
            continue
        match = await _create_bot_match(session, ticket, game_key=game_key)
        if match:
            filled += 1
    await session.flush()
    return filled


async def pair_searching_tickets(session: AsyncSession, *, limit: int = 40) -> int:
    """Claim searching tickets and pair them. Returns number of matches created.

    Humans in the same category (or same concrete game) are paired first.
    Lonely tickets waiting past BOT_FILL_AFTER get a bot opponent.
    """
    if not get_settings().online_matchmaking_enabled:
        return 0
    now = datetime.now(UTC)
    # Drop heartbeat-stale searchers only. Lonely tickets are bot-filled, not expired on TTL.
    stale = list(
        await session.scalars(
            select(MatchmakingTicket).where(
                MatchmakingTicket.status == "searching",
                MatchmakingTicket.last_heartbeat_at < now - HEARTBEAT_STALE,
            ).limit(100)
        )
    )
    for t in stale:
        t.status = "expired"
        t.updated_at = now

    rows = list(
        await session.scalars(
            select(MatchmakingTicket)
            .where(
                MatchmakingTicket.status == "searching",
                MatchmakingTicket.last_heartbeat_at >= now - HEARTBEAT_STALE,
            )
            .order_by(MatchmakingTicket.created_at)
            .with_for_update(skip_locked=True)
            .limit(limit)
        )
    )

    created = 0
    if len(rows) >= 2:
        concrete_counts: dict[str, int] = defaultdict(int)
        for t in rows:
            if t.game_key:
                concrete_counts[t.game_key] += 1
        popular = max(concrete_counts, key=concrete_counts.get) if concrete_counts else None
        if popular is None:
            enabled = await _enabled_game_keys(session)
            popular = enabled[0] if enabled else None

        by_bucket: dict[str, list[MatchmakingTicket]] = defaultdict(list)
        for t in rows:
            by_bucket[_queue_bucket(t)].append(t)

        used: set[UUID] = set()
        for _bucket, tickets in by_bucket.items():
            for i, a in enumerate(tickets):
                if a.id in used:
                    continue
                partner = None
                for b in tickets[i + 1 :]:
                    if b.id in used or b.user_id == a.user_id:
                        continue
                    pref = (
                        (a.preferred_opponent_id == b.user_id)
                        or (b.preferred_opponent_id == a.user_id)
                    )
                    if pref:
                        if await _blocked(session, a.user_id, b.user_id):
                            continue
                        partner = b
                        break
                if partner is None:
                    for b in tickets[i + 1 :]:
                        if b.id in used or b.user_id == a.user_id:
                            continue
                        if await _blocked(session, a.user_id, b.user_id):
                            continue
                        partner = b
                        break
                if partner is None:
                    continue
                game_key = await _resolve_game_key(session, a, popular=popular)
                if not game_key:
                    continue
                await _create_match(session, a, partner, game_key)
                used.add(a.id)
                used.add(partner.id)
                created += 1

    created += await fill_lonely_tickets_with_bots(session, limit=limit)
    await session.flush()
    return created


async def get_match(session: AsyncSession, match_id: UUID, user_id: UUID) -> Match:
    require_enabled()
    match = await session.get(Match, match_id)
    if match is None:
        raise AppError("not_found", "Match not found.", 404)
    if user_id not in {match.player_a_id, match.player_b_id}:
        raise AppError("forbidden", "You're not part of this match.", 403)
    # Bot score before deadline forfeit — otherwise history stays stuck on one-sided results.
    await catch_up_bot_play_if_needed(session, match)
    await finalize_match_if_needed(session, match)
    return match


async def list_matches(session: AsyncSession, user_id: UUID, *, limit: int = 30) -> list[Match]:
    require_enabled()
    rows = list(
        await session.scalars(
            select(Match)
            .where(or_(Match.player_a_id == user_id, Match.player_b_id == user_id))
            .order_by(Match.created_at.desc())
            .limit(limit)
        )
    )
    for row in rows:
        await catch_up_bot_play_if_needed(session, row)
        await finalize_match_if_needed(session, row)
    return rows


async def forfeit_match(session: AsyncSession, match_id: UUID, user_id: UUID) -> Match:
    require_enabled()
    match = await get_match(session, match_id, user_id)
    if match.status not in OPEN_MATCH:
        return match
    match.status = "forfeit"
    match.completed_at = datetime.now(UTC)
    match.updated_at = datetime.now(UTC)
    await session.flush()
    await _notify_match(session, match, "match.cancelled")
    return match


async def rematch(session: AsyncSession, match_id: UUID, user_id: UUID, *, idempotency_key: str) -> Match:
    """Create a fresh ready match between the same players (M12)."""
    require_enabled()
    prior = await get_match(session, match_id, user_id)
    if prior.status not in ("completed", "forfeit", "expired"):
        raise AppError("conflict", "Finish the current match before a rematch.", 409)
    opponent = prior.player_b_id if user_id == prior.player_a_id else prior.player_a_id

    # Idempotent rematch: reuse an open rematch child if present.
    existing = await session.scalar(
        select(Match).where(
            Match.rematch_of_id == prior.id,
            Match.status.in_(OPEN_MATCH),
        )
    )
    if existing and user_id in {existing.player_a_id, existing.player_b_id}:
        return existing

    opponent_user = await session.get(User, opponent)
    vs_bot = bool(prior.opponent_is_bot or (opponent_user and opponent_user.is_bot))

    now = datetime.now(UTC)
    ready_at = now + COUNTDOWN
    match = Match(
        game_key=prior.game_key,
        seed=_new_seed(),
        status="ready",
        player_a_id=user_id,
        player_b_id=opponent,
        found_at=now,
        ready_at=ready_at,
        play_deadline_at=ready_at + PLAY_WINDOW,
        rematch_of_id=prior.id,
        opponent_is_bot=vs_bot,
    )
    session.add(match)
    await session.flush()
    await _record_event(
        session,
        match.id,
        "rematch",
        {"from": str(prior.id), "by": str(user_id), "bot": vs_bot},
    )
    await _notify_match(session, match, "match.found")
    await enqueue(session, "match.ready", {"matchId": str(match.id), "readyAt": _iso(ready_at)})
    if vs_bot:
        await _schedule_bot_play(session, match)
    # Keep idempotency_key referenced so callers can retry safely via rematch_of lookup.
    _ = idempotency_key
    return match


async def attach_play_to_match(
    session: AsyncSession,
    *,
    match_id: UUID,
    user_id: UUID,
    play: GamePlay,
) -> Match:
    require_enabled()
    match = await get_match(session, match_id, user_id)
    if match.status in ("cancelled", "completed", "forfeit", "expired"):
        raise AppError("conflict", "This match is already finished.", 409)
    if play.game_key != match.game_key:
        raise AppError("invalid_play", "That play doesn't match this game.", 422)
    if play.user_id != user_id:
        raise AppError("forbidden", "Play does not belong to you.", 403)
    if play.seed and play.seed != match.seed:
        raise AppError("invalid_play", "That play doesn't use this match seed.", 422)

    if user_id == match.player_a_id:
        if match.play_a_id and match.play_a_id != play.id:
            raise AppError("conflict", "You already submitted a score for this match.", 409)
        match.play_a_id = play.id
    else:
        if match.play_b_id and match.play_b_id != play.id:
            raise AppError("conflict", "You already submitted a score for this match.", 409)
        match.play_b_id = play.id

    play.match_id = match.id
    if play.seed is None:
        play.seed = match.seed
    if match.status == "ready":
        match.status = "playing"
    match.updated_at = datetime.now(UTC)
    await session.flush()

    # Human finished first vs bot → short delay then bot score (feels live).
    if match.opponent_is_bot and match.status in OPEN_MATCH:
        bot_id = await bot_ops.bot_user_id_for_match(session, match)
        human_played = (user_id != bot_id) if bot_id else True
        bot_play_id = (
            match.play_a_id
            if bot_id == match.player_a_id
            else match.play_b_id
            if bot_id
            else None
        )
        if human_played and bot_play_id is None:
            await _schedule_bot_play(
                session,
                match,
                delay=timedelta(seconds=random.randint(2, 12)),
            )

    await finalize_match_if_needed(session, match)
    return match


async def _bot_and_human_play_ids(
    session: AsyncSession, match: Match
) -> tuple[UUID | None, UUID | None, UUID | None]:
    """Return (bot_user_id, bot_play_id, human_play_id)."""
    bot_id = await bot_ops.bot_user_id_for_match(session, match)
    if bot_id is None:
        return None, None, None
    if bot_id == match.player_a_id:
        return bot_id, match.play_a_id, match.play_b_id
    return bot_id, match.play_b_id, match.play_a_id


async def match_awaits_bot_play(session: AsyncSession, match: Match) -> bool:
    """True when this open bot match still has no bot GamePlay attached."""
    if not match.opponent_is_bot or match.status not in OPEN_MATCH:
        return False
    bot_id, bot_play_id, _human_play_id = await _bot_and_human_play_ids(session, match)
    return bot_id is not None and bot_play_id is None


async def catch_up_bot_play_if_needed(session: AsyncSession, match: Match) -> bool:
    """Finish a stalled bot score once the human has submitted (worker/outbox safety net).

    Result-screen polls hit serialize_match; without this, a dead worker leaves
    "Waiting for Zara…" until the play deadline forfeits the match.

    Also heals already-forfeited bot matches that never got a bot GamePlay (list/get
    used to finalize before catch-up, which locked out the bot score forever).
    """
    if not match.opponent_is_bot:
        return False
    if match.status not in (*OPEN_MATCH, "forfeit"):
        return False
    if not get_settings().online_matchmaking_enabled:
        return False

    bot_id, bot_play_id, human_play_id = await _bot_and_human_play_ids(session, match)
    if bot_id is None or bot_play_id is not None or human_play_id is None:
        return False

    human_play = await session.get(GamePlay, human_play_id)
    if human_play is None:
        return False
    # Open matches wait for a short grace so the normal outbox path can win.
    # Forfeits are already late — attach the bot score immediately.
    if match.status in OPEN_MATCH:
        submitted_at = getattr(human_play, "created_at", None) or match.updated_at
        if submitted_at is None:
            return False
        if submitted_at.tzinfo is None:
            submitted_at = submitted_at.replace(tzinfo=UTC)
        if datetime.now(UTC) - submitted_at < BOT_PLAY_CATCHUP_AFTER:
            return False

    return await execute_bot_play(session, match.id)


async def catch_up_overdue_bot_plays(session: AsyncSession, *, limit: int = 40) -> int:
    """Worker sweep: attach bot scores for open matches the outbox never finished."""
    if not get_settings().online_matchmaking_enabled:
        return 0
    cutoff = datetime.now(UTC) - BOT_PLAY_CATCHUP_AFTER
    rows = list(
        await session.scalars(
            select(Match)
            .where(
                Match.opponent_is_bot.is_(True),
                Match.status.in_(OPEN_MATCH),
                Match.updated_at <= cutoff,
                or_(
                    and_(Match.play_a_id.is_not(None), Match.play_b_id.is_(None)),
                    and_(Match.play_b_id.is_not(None), Match.play_a_id.is_(None)),
                ),
            )
            .order_by(Match.updated_at)
            .with_for_update(skip_locked=True)
            .limit(limit)
        )
    )
    done = 0
    for match in rows:
        if await catch_up_bot_play_if_needed(session, match):
            done += 1
    return done


async def execute_bot_play(session: AsyncSession, match_id: UUID) -> bool:
    """Insert a plausible bot GamePlay and attach it. Returns True if a play was attached."""
    if not get_settings().online_matchmaking_enabled:
        return False
    match = await session.get(Match, match_id)
    if match is None or not match.opponent_is_bot:
        return False
    if match.status not in (*OPEN_MATCH, "forfeit"):
        return False

    bot_id, bot_play_id, human_play_id = await _bot_and_human_play_ids(session, match)
    if bot_id is None or bot_play_id is not None:
        return False

    human_score = None
    human_duration = None
    if human_play_id:
        human_play = await session.get(GamePlay, human_play_id)
        if human_play:
            human_score = human_play.score
            human_duration = human_play.duration_ms

    direction, max_score = await bot_ops.resolve_game_scoring(session, match.game_key)
    samples = await bot_ops.recent_scores(session, match.game_key) if human_score is None else []
    score = bot_ops.competitive_score(
        human_score=human_score,
        samples=samples,
        direction=direction,
        max_score=max_score,
    )
    duration_ms = bot_ops.realistic_duration_ms(human_duration_ms=human_duration)

    idem = f"bot-play-{match.id}"
    existing = await session.scalar(
        select(GamePlay).where(
            GamePlay.user_id == bot_id,
            GamePlay.idempotency_key == idem,
        )
    )
    if existing is not None:
        play = existing
    else:
        play = GamePlay(
            game_key=match.game_key,
            user_id=bot_id,
            guest_session_id=None,
            score=score,
            duration_ms=duration_ms,
            idempotency_key=idem,
            seed=match.seed,
            summary={"source": "matchmaking_fill"},
            match_id=match.id,
        )
        session.add(play)
        await session.flush()

    # Attach without re-entering get_match auth for the bot path.
    if bot_id == match.player_a_id:
        match.play_a_id = play.id
    else:
        match.play_b_id = play.id
    play.match_id = match.id
    if play.seed is None:
        play.seed = match.seed
    if match.status == "ready":
        match.status = "playing"
    match.updated_at = datetime.now(UTC)
    await session.flush()
    await _record_event(
        session,
        match.id,
        "bot_play",
        {"userId": str(bot_id), "score": play.score, "durationMs": play.duration_ms},
    )
    await finalize_match_if_needed(session, match)
    return True


async def mark_ready_matches(session: AsyncSession) -> int:
    """Emit match.ready once when countdown has elapsed (worker)."""
    if not get_settings().online_matchmaking_enabled:
        return 0
    now = datetime.now(UTC)
    rows = list(
        await session.scalars(
            select(Match).where(
                Match.status == "ready",
                Match.ready_at.is_not(None),
                Match.ready_at <= now,
            ).limit(50)
        )
    )
    sent = 0
    for match in rows:
        already = await session.scalar(
            select(MatchEvent.id).where(
                MatchEvent.match_id == match.id,
                MatchEvent.kind == "ready_sent",
            ).limit(1)
        )
        if already:
            continue
        await _record_event(session, match.id, "ready_sent", {"at": _iso(now)})
        await _notify_match(session, match, "match.ready")
        match.updated_at = now
        sent += 1
    await session.flush()
    return sent


async def finalize_due_matches(session: AsyncSession) -> int:
    if not get_settings().online_matchmaking_enabled:
        return 0
    now = datetime.now(UTC)
    rows = list(
        await session.scalars(
            select(Match)
            .where(
                Match.status.in_(OPEN_MATCH),
                Match.play_deadline_at.is_not(None),
                Match.play_deadline_at <= now,
            )
            .with_for_update(skip_locked=True)
            .limit(50)
        )
    )
    for match in rows:
        await catch_up_bot_play_if_needed(session, match)
        await finalize_match_if_needed(session, match)
    return len(rows)


async def advisory_pair_lock(session: AsyncSession) -> bool:
    """Try a transaction-level advisory lock so only one pairer runs."""
    result = await session.execute(text("SELECT pg_try_advisory_xact_lock(87201412)"))
    return bool(result.scalar())
