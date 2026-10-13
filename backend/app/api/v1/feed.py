
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import Actor, get_actor
from app.infrastructure.postgres.db import get_session
from app.modules.feed.service import build_feed

router = APIRouter(tags=["feed"])


@router.get("/feed")
async def get_feed(
    limit: int = Query(default=10, ge=1, le=20),
    cursor: str | None = Query(default=None, max_length=64),
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(get_actor),
) -> dict:
    return await build_feed(session, user_id=actor.user_id, guest_id=actor.guest_id, limit=limit, cursor=cursor)
