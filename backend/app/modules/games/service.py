from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import Actor
from app.common.errors import AppError
from app.config import get_settings
from app.infrastructure.postgres.models import GamePlay, GuestSession, MiniGame
from app.modules.games.scoring import clamp_score, percentile
from app.modules.responses.service import _bump_daily


async def submit_play(
    session: AsyncSession,
    actor: Actor,
    game_key: str,
    score: int,
    duration_ms: int,
    idempotency_key: str | None,
) -> dict:
    game = await session.get(MiniGame, game_key)
    if game is None or game.status != "enabled":
        raise AppError("not_found", "Game not available.", 404)
    max_score = int((game.config or {}).get("maxScore") or 1000000)
    score = clamp_score(score, max_score)
    duration_ms = max(0, min(duration_ms, 300000))

    if idempotency_key:
        stmt = select(GamePlay).where(GamePlay.game_key == game_key, GamePlay.idempotency_key == idempotency_key)
        if actor.user_id:
            stmt = stmt.where(GamePlay.user_id == actor.user_id)
        else:
            stmt = stmt.where(GamePlay.guest_session_id == actor.guest_id)
        existing = await session.scalar(stmt)
        if existing:
            stats = await game_stats(session, game_key, existing.score)
            return {"playId": str(existing.id), "score": existing.score, "created": False, **stats, "promptAccountCreation": _prompt(actor)}

    play = GamePlay(
        game_key=game_key,
        user_id=actor.user_id,
        guest_session_id=actor.guest_id,
        score=score,
        duration_ms=duration_ms,
        idempotency_key=idempotency_key,
    )
    session.add(play)
    if actor.guest_id:
        guest = await session.get(GuestSession, actor.guest_id)
        if guest:
            guest.games_played_count += 1
            actor.engagements = guest.moments_responded_count + guest.games_played_count
    if actor.user_id:
        await _bump_daily(session, actor.user_id, games=1)
    await session.flush()
    stats = await game_stats(session, game_key, score)
    return {
        "playId": str(play.id),
        "score": score,
        "created": True,
        **stats,
        "promptAccountCreation": _prompt(actor),
    }


def _prompt(actor: Actor) -> bool:
    return actor.kind == "guest" and actor.engagements >= get_settings().account_prompt_after


async def game_stats(session: AsyncSession, game_key: str, score: int | None = None) -> dict:
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
        payload["percentile"] = percentile(score, scores)
    return payload
