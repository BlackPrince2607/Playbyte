from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import Actor, get_actor
from app.infrastructure.postgres.db import get_session
from app.infrastructure.postgres.models import MiniGame
from app.modules.games.service import game_stats, submit_play

router = APIRouter(prefix="/games", tags=["games"])


class PlayIn(BaseModel):
    score: int = Field(ge=0, le=1_000_000)
    durationMs: int = Field(ge=0, le=300_000)


@router.get("")
async def list_games(session: AsyncSession = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    rows = await session.scalars(select(MiniGame).where(MiniGame.status == "enabled").order_by(MiniGame.sort_order))
    return {
        "games": [
            {"key": g.key, "title": g.title, "blurb": g.blurb, "config": g.config} for g in rows
        ]
    }


@router.get("/{game_key}/stats")
async def get_stats(
    game_key: str,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(get_actor),
) -> dict:
    return await game_stats(session, game_key)


@router.post("/{game_key}/plays")
async def post_play(
    game_key: str,
    body: PlayIn,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(get_actor),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    return await submit_play(session, actor, game_key, body.score, body.durationMs, idempotency_key)
