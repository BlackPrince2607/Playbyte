from uuid import UUID

from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import Actor, require_user
from app.common.errors import AppError
from app.infrastructure.postgres.db import get_session
from app.modules.matchmaking import service as mm

router = APIRouter(prefix="/matches", tags=["matches"])


@router.get("/{match_id}")
async def get_one(
    match_id: UUID,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
) -> dict:
    row = await mm.get_match(session, match_id, actor.user_id)
    return await mm.serialize_match(session, row, viewer_id=actor.user_id)


@router.post("/{match_id}/forfeit")
async def post_forfeit(
    match_id: UUID,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
) -> dict:
    row = await mm.forfeit_match(session, match_id, actor.user_id)
    return await mm.serialize_match(session, row, viewer_id=actor.user_id)


@router.post("/{match_id}/rematch")
async def post_rematch(
    match_id: UUID,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    if not idempotency_key:
        raise AppError("idempotency_required", "Idempotency-Key header is required.", 400)
    row = await mm.rematch(session, match_id, actor.user_id, idempotency_key=idempotency_key[:128])
    return await mm.serialize_match(session, row, viewer_id=actor.user_id)
