from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import Actor, get_actor
from app.infrastructure.postgres.db import get_session
from app.infrastructure.postgres.models import MiniGame
from app.modules.games.service import catalog_entry, game_stats, submit_play

router = APIRouter(prefix="/games", tags=["games"])


class PlaySummary(BaseModel):
    correct: int | None = Field(default=None, ge=0, le=100_000)
    attempts: int | None = Field(default=None, ge=0, le=100_000)
    breakdown: dict[str, int] | None = None


class PlayIn(BaseModel):
    score: int = Field(ge=0, le=1_000_000)
    # Align with service/DB clamp (2h) so endless sessions can submit.
    durationMs: int = Field(ge=0, le=7_200_000)
    # Game Engine SDK metadata (optional; legacy clients omit it).
    engine: str | None = Field(default=None, max_length=40)
    variation: str | None = Field(default=None, max_length=60)
    engineVersion: int | None = Field(default=None, ge=0, le=10_000)
    seed: str | None = Field(default=None, max_length=80)
    level: float | None = Field(default=None, ge=0, le=1)
    summary: PlaySummary | None = None

    def meta(self) -> dict | None:
        if not self.engine:
            return None
        summary = self.summary.model_dump(exclude_none=True) if self.summary else {}
        if "breakdown" in summary:
            summary["breakdown"] = dict(list(summary["breakdown"].items())[:20])
        if self.level is not None:
            summary["level"] = round(self.level, 3)
        return {
            "engine": self.engine,
            "variation": self.variation,
            "engine_version": self.engineVersion,
            "seed": self.seed,
            "summary": summary or None,
        }


async def _enabled_games(session: AsyncSession) -> list[MiniGame]:
    return list(await session.scalars(select(MiniGame).where(MiniGame.status == "enabled").order_by(MiniGame.sort_order)))


@router.get("")
async def list_games(session: AsyncSession = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    return {"games": [catalog_entry(g) for g in await _enabled_games(session)]}


@router.get("/catalog")
async def get_catalog(session: AsyncSession = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    """Game discovery: every enabled game with its engine, variation and scoring direction.

    Clients show only entries whose engine they support (or whose retired key maps to one).
    """
    return {"games": [catalog_entry(g) for g in await _enabled_games(session)]}


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
    return await submit_play(session, actor, game_key, body.score, body.durationMs, idempotency_key, meta=body.meta())
