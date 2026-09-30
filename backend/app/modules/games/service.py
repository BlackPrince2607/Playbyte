from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import Actor
from app.common.errors import AppError
from app.config import get_settings
from app.infrastructure.postgres.models import GamePlay, GuestSession, MiniGame
from app.modules.games.scoring import clamp_score, min_plausible_duration_ms, percentile
from app.modules.responses.service import _bump_daily

PLAYS_PER_MINUTE_LIMIT = 30


def catalog_entry(g: MiniGame) -> dict:
    entry = {"key": g.key, "title": g.title, "blurb": g.blurb, "config": g.config or {}}
    if getattr(g, "engine", None):
        entry["engine"] = g.engine
        entry["variation"] = g.variation
        entry["configVersion"] = g.config_version
    entry["scoreDirection"] = getattr(g, "score_direction", None) or "higher_is_better"
    return entry


async def _recent_play_count(session: AsyncSession, actor: Actor) -> int:
    since = datetime.now(UTC) - timedelta(minutes=1)
    stmt = select(func.count()).select_from(GamePlay).where(GamePlay.created_at >= since)
    if actor.user_id:
        stmt = stmt.where(GamePlay.user_id == actor.user_id)
    else:
        stmt = stmt.where(GamePlay.guest_session_id == actor.guest_id)
    return int(await session.scalar(stmt) or 0)


async def _existing_play(
    session: AsyncSession,
    actor: Actor,
    game_key: str,
    idempotency_key: str,
) -> GamePlay | None:
    stmt = select(GamePlay).where(GamePlay.game_key == game_key, GamePlay.idempotency_key == idempotency_key)
    if actor.user_id:
        stmt = stmt.where(GamePlay.user_id == actor.user_id)
    else:
        stmt = stmt.where(GamePlay.guest_session_id == actor.guest_id)
    return await session.scalar(stmt)


async def submit_play(
    session: AsyncSession,
    actor: Actor,
    game_key: str,
    score: int,
    duration_ms: int,
    idempotency_key: str | None,
    meta: dict | None = None,
) -> dict:
    game = await session.get(MiniGame, game_key)
    if game is None or game.status != "enabled":
        raise AppError("not_found", "Game not available.", 404)
    max_score = int((game.config or {}).get("maxScore") or 1000000)
    score = clamp_score(score, max_score)
    duration_ms = max(0, min(duration_ms, 7_200_000))  # 2h safety max
    direction = getattr(game, "score_direction", None) or "higher_is_better"

    if meta:
        attempts = (meta.get("summary") or {}).get("attempts")
        if score > 0 and duration_ms < min_plausible_duration_ms(attempts):
            raise AppError("implausible_play", "This play could not be recorded.", 422)

    if idempotency_key:
        existing = await _existing_play(session, actor, game_key, idempotency_key)
        if existing:
            stats = await game_stats(session, game_key, existing.score, direction)
            return {
                "playId": str(existing.id),
                "score": existing.score,
                "created": False,
                **stats,
                "promptAccountCreation": _prompt(actor),
            }

    if await _recent_play_count(session, actor) >= PLAYS_PER_MINUTE_LIMIT:
        raise AppError("rate_limited", "Too many plays — take a short break.", 429)

    play = GamePlay(
        game_key=game_key,
        user_id=actor.user_id,
        guest_session_id=actor.guest_id,
        score=score,
        duration_ms=duration_ms,
        idempotency_key=idempotency_key,
        engine=(meta or {}).get("engine"),
        variation=(meta or {}).get("variation"),
        seed=(meta or {}).get("seed"),
        engine_version=(meta or {}).get("engine_version"),
        config_version=getattr(game, "config_version", None) if meta else None,
        summary=(meta or {}).get("summary"),
    )
    session.add(play)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        if not idempotency_key:
            raise AppError("conflict", "Could not record play.", 409) from None
        existing = await _existing_play(session, actor, game_key, idempotency_key)
        if existing is None:
            raise AppError("conflict", "Could not record play.", 409) from None
        stats = await game_stats(session, game_key, existing.score, direction)
        return {
            "playId": str(existing.id),
            "score": existing.score,
            "created": False,
            **stats,
            "promptAccountCreation": _prompt(actor),
        }

    if actor.guest_id:
        guest = await session.get(GuestSession, actor.guest_id)
        if guest:
            guest.games_played_count += 1
            actor.engagements = guest.moments_responded_count + guest.games_played_count
    if actor.user_id:
        await _bump_daily(session, actor.user_id, games=1)
    await session.flush()
    stats = await game_stats(session, game_key, score, direction)
    return {
        "playId": str(play.id),
        "score": score,
        "created": True,
        **stats,
        "promptAccountCreation": _prompt(actor),
    }


def _prompt(actor: Actor) -> bool:
    return actor.kind == "guest" and actor.engagements >= get_settings().account_prompt_after


async def game_stats(
    session: AsyncSession, game_key: str, score: int | None = None, direction: str = "higher_is_better"
) -> dict:
    day_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    plays_today = await session.scalar(
        select(func.count()).select_from(GamePlay).where(
            GamePlay.game_key == game_key, GamePlay.created_at >= day_start
        )
    )
    scores = list(
        await session.scalars(
            select(GamePlay.score).where(GamePlay.game_key == game_key, GamePlay.created_at >= day_start)
        )
    )
    avg = round(sum(scores) / len(scores), 1) if scores else 0.0
    payload = {"playsToday": int(plays_today or 0), "averageScore": avg}
    if score is not None:
        payload["percentile"] = percentile(score, scores, lower_is_better=direction == "lower_is_better")
    return payload
