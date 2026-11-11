from __future__ import annotations

import secrets
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import or_, select, text
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
)
from app.infrastructure.queue.outbox import enqueue

SEARCH_TTL = timedelta(seconds=20)
SEARCH_EXTEND = timedelta(seconds=20)
HEARTBEAT_STALE = timedelta(seconds=15)
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
    if ticket.expires_at <= now or stale:
        ticket.status = "expired"
        ticket.updated_at = now
        await session.flush()


async def finalize_match_if_needed(session: AsyncSession, match: Match) -> None:
    if match.status not in OPEN_MATCH:
        return
    now = datetime.now(UTC)
    prev = match.status
    if match.play_a_id and match.play_b_id:
        match.status = "completed"
        match.completed_at = now
        match.updated_at = now
        await session.flush()
        if prev != match.status:
            await _notify_match(session, match, "match.result")
        return
    if match.play_deadline_at and match.play_deadline_at <= now:
        match.status = "forfeit" if (match.play_a_id or match.play_b_id) else "expired"
        match.completed_at = now
        match.updated_at = now
        await session.flush()
        if prev != match.status:
            await _notify_match(session, match, "match.result")


async def enqueue_ticket(
    session: AsyncSession,
    user_id: UUID,
    *,
    game_key: str | None,
    idempotency_key: str | None,
    preferred_opponent_id: UUID | None = None,
    extend_existing: bool = False,
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

    if game_key:
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


async def _create_match(
    session: AsyncSession,
    a: MatchmakingTicket,
    b: MatchmakingTicket,
    game_key: str,
    *,
    rematch_of_id: UUID | None = None,
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
        {"playerA": str(player_a), "playerB": str(player_b), "gameKey": game_key},
    )
    await _notify_match(session, match, "match.found")
    await enqueue(
        session,
        "match.ready",
        {"matchId": str(match.id), "readyAt": _iso(ready_at)},
    )
    await session.flush()
    return match


async def pair_searching_tickets(session: AsyncSession, *, limit: int = 40) -> int:
    """Claim searching tickets and pair them. Returns number of matches created."""
    if not get_settings().online_matchmaking_enabled:
        return 0
    now = datetime.now(UTC)
    # Drop stale / expired first (best-effort, not locked).
    stale = list(
        await session.scalars(
            select(MatchmakingTicket).where(
                MatchmakingTicket.status == "searching",
                or_(
                    MatchmakingTicket.expires_at <= now,
                    MatchmakingTicket.last_heartbeat_at < now - HEARTBEAT_STALE,
                ),
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
                MatchmakingTicket.expires_at > now,
                MatchmakingTicket.last_heartbeat_at >= now - HEARTBEAT_STALE,
            )
            .order_by(MatchmakingTicket.created_at)
            .with_for_update(skip_locked=True)
            .limit(limit)
        )
    )
    if len(rows) < 2:
        await session.flush()
        return 0

    # Resolve any-game tickets to the most common concrete key among searchers.
    concrete_counts: dict[str, int] = defaultdict(int)
    for t in rows:
        if t.game_key:
            concrete_counts[t.game_key] += 1
    popular = max(concrete_counts, key=concrete_counts.get) if concrete_counts else None
    if popular is None:
        enabled = await session.scalar(
            select(MiniGame.key).where(MiniGame.status == "enabled").order_by(MiniGame.sort_order).limit(1)
        )
        popular = enabled

    by_key: dict[str, list[MatchmakingTicket]] = defaultdict(list)
    for t in rows:
        key = t.game_key or popular
        if not key:
            continue
        by_key[key].append(t)

    created = 0
    used: set[UUID] = set()
    for game_key, tickets in by_key.items():
        # Prefer rematch / preferred opponent pairs first.
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
            await _create_match(session, a, partner, game_key)
            used.add(a.id)
            used.add(partner.id)
            created += 1
    await session.flush()
    return created


async def get_match(session: AsyncSession, match_id: UUID, user_id: UUID) -> Match:
    require_enabled()
    match = await session.get(Match, match_id)
    if match is None:
        raise AppError("not_found", "Match not found.", 404)
    if user_id not in {match.player_a_id, match.player_b_id}:
        raise AppError("forbidden", "You're not part of this match.", 403)
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
    )
    session.add(match)
    await session.flush()
    await _record_event(session, match.id, "rematch", {"from": str(prior.id), "by": str(user_id)})
    await _notify_match(session, match, "match.found")
    await enqueue(session, "match.ready", {"matchId": str(match.id), "readyAt": _iso(ready_at)})
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
    await finalize_match_if_needed(session, match)
    return match


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
        await finalize_match_if_needed(session, match)
    return len(rows)


async def advisory_pair_lock(session: AsyncSession) -> bool:
    """Try a transaction-level advisory lock so only one pairer runs."""
    result = await session.execute(text("SELECT pg_try_advisory_xact_lock(87201412)"))
    return bool(result.scalar())
