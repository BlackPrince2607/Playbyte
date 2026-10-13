from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import Actor, get_actor
from app.infrastructure.postgres.db import get_session
from app.modules.leaderboard.service import leaderboard

router = APIRouter(prefix="/leaderboards", tags=["leaderboards"])


@router.get("/{scope}")
async def get_leaderboard(
    scope: str,
    period: str = Query(default="week", max_length=8),
    limit: int = Query(default=50, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(get_actor),
) -> dict:
    return await leaderboard(session, scope=scope, period=period, viewer=actor.user_id, limit=limit)
