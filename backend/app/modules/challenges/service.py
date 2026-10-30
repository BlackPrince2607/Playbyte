from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors import AppError
from app.infrastructure.postgres.models import Challenge, Friendship, GamePlay, MiniGame, Profile

CHALLENGE_TTL = timedelta(days=7)
OPEN_STATUSES = ("pending", "active")


def _pair(a: UUID, b: UUID) -> tuple[UUID, UUID]:
    return (a, b) if a < b else (b, a)


def _new_seed() -> str:
    return secrets.token_hex(8)


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


async def _require_friends(session: AsyncSession, a: UUID, b: UUID) -> None:
    if a == b:
        raise AppError("invalid", "You can't challenge yourself.", 422)
    lo, hi = _pair(a, b)
    row = await session.scalar(
        select(Friendship).where(
            Friendship.user_a == lo,
            Friendship.user_b == hi,
            Friendship.status == "accepted",
        )
    )
    if row is None:
        raise AppError("forbidden", "You can only challenge friends.", 403)


async def _expire_if_needed(challenge: Challenge) -> None:
    if challenge.status in OPEN_STATUSES and challenge.expires_at <= datetime.now(UTC):
        challenge.status = "expired"
        challenge.updated_at = datetime.now(UTC)


def _maybe_complete(challenge: Challenge) -> None:
    if challenge.challenger_play_id and challenge.opponent_play_id and challenge.status in OPEN_STATUSES:
        challenge.status = "completed"
        challenge.updated_at = datetime.now(UTC)


async def _play_score(session: AsyncSession, play_id: UUID | None) -> int | None:
    if play_id is None:
        return None
    play = await session.get(GamePlay, play_id)
    return play.score if play else None


async def _player(session: AsyncSession, user_id: UUID) -> dict:
    profile = await session.get(Profile, user_id)
    return {
        "userId": str(user_id),
        "displayName": profile.display_name if profile else "Player",
        "avatarKey": profile.avatar_key if profile else None,
    }


async def serialize_challenge(
    session: AsyncSession,
    challenge: Challenge,
    *,
    viewer_id: UUID | None = None,
) -> dict:
    await _expire_if_needed(challenge)
    game = await session.get(MiniGame, challenge.game_key)
    challenger_score = await _play_score(session, challenge.challenger_play_id)
    opponent_score = await _play_score(session, challenge.opponent_play_id)
    payload = {
        "id": str(challenge.id),
        "status": challenge.status,
        "gameKey": challenge.game_key,
        "gameTitle": game.title if game else challenge.game_key,
        "seed": challenge.seed,
        "createdAt": _iso(challenge.created_at),
        "expiresAt": _iso(challenge.expires_at),
        "challenger": await _player(session, challenge.challenger_id),
        "opponent": await _player(session, challenge.opponent_id),
        "challengerScore": challenger_score,
        "opponentScore": opponent_score,
        "momentId": str(challenge.moment_id) if challenge.moment_id else None,
    }
    if viewer_id is not None:
        payload["role"] = "challenger" if viewer_id == challenge.challenger_id else "opponent"
        my_play = (
            challenge.challenger_play_id
            if viewer_id == challenge.challenger_id
            else challenge.opponent_play_id
        )
        their_play = (
            challenge.opponent_play_id
            if viewer_id == challenge.challenger_id
            else challenge.challenger_play_id
        )
        payload["myScore"] = await _play_score(session, my_play)
        payload["theirScore"] = await _play_score(session, their_play)
        payload["iHavePlayed"] = my_play is not None
        payload["theyHavePlayed"] = their_play is not None
    return payload


async def create_challenge(
    session: AsyncSession,
    challenger_id: UUID,
    opponent_id: UUID,
    game_key: str,
    *,
    moment_id: UUID | None = None,
    play_id: UUID | None = None,
    seed: str | None = None,
    idempotency_key: str | None = None,
) -> Challenge:
    if idempotency_key:
        existing = await session.scalar(
            select(Challenge).where(
                Challenge.challenger_id == challenger_id,
                Challenge.idempotency_key == idempotency_key,
            )
        )
        if existing:
            return existing

    await _require_friends(session, challenger_id, opponent_id)
    game = await session.get(MiniGame, game_key)
    if game is None or game.status != "enabled":
        raise AppError("unsupported_game", "That game can't be challenged right now.", 422)

    resolved_seed = (seed or _new_seed())[:80]
    challenger_play_id: UUID | None = None
    if play_id is not None:
        play = await session.get(GamePlay, play_id)
        if (
            play is None
            or play.user_id != challenger_id
            or play.game_key != game_key
        ):
            raise AppError("invalid_play", "That play can't be attached to this challenge.", 422)
        if play.challenge_id is not None:
            raise AppError("conflict", "That play is already part of a challenge.", 409)
        resolved_seed = (play.seed or resolved_seed)[:80]
        challenger_play_id = play.id

    row = Challenge(
        challenger_id=challenger_id,
        opponent_id=opponent_id,
        game_key=game_key,
        moment_id=moment_id,
        seed=resolved_seed,
        status="pending",
        expires_at=datetime.now(UTC) + CHALLENGE_TTL,
        challenger_play_id=challenger_play_id,
        idempotency_key=idempotency_key,
    )
    session.add(row)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        if idempotency_key:
            existing = await session.scalar(
                select(Challenge).where(
                    Challenge.challenger_id == challenger_id,
                    Challenge.idempotency_key == idempotency_key,
                )
            )
            if existing:
                return existing
        raise AppError("conflict", "Could not create challenge.", 409) from None

    if play_id is not None:
        play = await session.get(GamePlay, play_id)
        if play:
            play.challenge_id = row.id
            play.seed = play.seed or row.seed
        _maybe_complete(row)
        await session.flush()
    return row


async def get_challenge(session: AsyncSession, challenge_id: UUID, user_id: UUID) -> Challenge:
    row = await session.get(Challenge, challenge_id)
    if row is None:
        raise AppError("not_found", "Challenge not found.", 404)
    if user_id not in {row.challenger_id, row.opponent_id}:
        raise AppError("forbidden", "You're not part of this challenge.", 403)
    await _expire_if_needed(row)
    return row


async def accept_challenge(session: AsyncSession, challenge_id: UUID, user_id: UUID) -> Challenge:
    row = await get_challenge(session, challenge_id, user_id)
    if row.opponent_id != user_id:
        raise AppError("forbidden", "Only the challenged player can accept.", 403)
    if row.status == "active":
        return row
    if row.status != "pending":
        raise AppError("conflict", "This challenge is no longer open.", 409)
    row.status = "active"
    row.updated_at = datetime.now(UTC)
    await session.flush()
    return row


async def decline_challenge(session: AsyncSession, challenge_id: UUID, user_id: UUID) -> Challenge:
    row = await get_challenge(session, challenge_id, user_id)
    if row.opponent_id != user_id:
        raise AppError("forbidden", "Only the challenged player can decline.", 403)
    if row.status == "declined":
        return row
    if row.status != "pending":
        raise AppError("conflict", "This challenge is no longer open.", 409)
    row.status = "declined"
    row.updated_at = datetime.now(UTC)
    await session.flush()
    return row


async def list_challenges(
    session: AsyncSession,
    user_id: UUID,
    *,
    status: str | None = None,
) -> list[Challenge]:
    stmt = select(Challenge).where(
        or_(Challenge.challenger_id == user_id, Challenge.opponent_id == user_id)
    )
    if status:
        stmt = stmt.where(Challenge.status == status)
    stmt = stmt.order_by(Challenge.created_at.desc()).limit(50)
    rows = list(await session.scalars(stmt))
    for row in rows:
        await _expire_if_needed(row)
    return rows


async def attach_play_to_challenge(
    session: AsyncSession,
    *,
    challenge_id: UUID,
    user_id: UUID,
    play: GamePlay,
) -> Challenge:
    row = await get_challenge(session, challenge_id, user_id)
    if row.status == "expired":
        raise AppError("conflict", "This challenge has expired.", 409)
    if row.status in ("declined", "completed"):
        raise AppError("conflict", "This challenge is already finished.", 409)
    if play.game_key != row.game_key:
        raise AppError("invalid_play", "That play doesn't match this challenge game.", 422)
    if play.user_id != user_id:
        raise AppError("forbidden", "Play does not belong to you.", 403)

    if user_id == row.challenger_id:
        if row.challenger_play_id and row.challenger_play_id != play.id:
            raise AppError("conflict", "You already submitted a score for this challenge.", 409)
        row.challenger_play_id = play.id
    else:
        if row.status == "pending":
            # Auto-accept when the opponent submits a score.
            row.status = "active"
        if row.opponent_play_id and row.opponent_play_id != play.id:
            raise AppError("conflict", "You already submitted a score for this challenge.", 409)
        row.opponent_play_id = play.id

    play.challenge_id = row.id
    if play.seed is None:
        play.seed = row.seed
    _maybe_complete(row)
    row.updated_at = datetime.now(UTC)
    await session.flush()
    return row
