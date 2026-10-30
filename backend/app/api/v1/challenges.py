from uuid import UUID

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import Actor, require_user
from app.common.errors import AppError
from app.infrastructure.postgres.db import get_session
from app.modules.challenges.service import (
    accept_challenge,
    create_challenge,
    decline_challenge,
    get_challenge,
    serialize_challenge,
)

router = APIRouter(prefix="/challenges", tags=["challenges"])


class ChallengeIn(BaseModel):
    opponentUserId: UUID
    gameKey: str = Field(min_length=1, max_length=80)
    momentId: UUID | None = None
    playId: UUID | None = None
    seed: str | None = Field(default=None, min_length=1, max_length=80)


@router.post("")
async def post_challenge(
    body: ChallengeIn,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    if not idempotency_key:
        raise AppError("idempotency_required", "Idempotency-Key header is required.", 400)
    row = await create_challenge(
        session,
        actor.user_id,
        body.opponentUserId,
        body.gameKey,
        moment_id=body.momentId,
        play_id=body.playId,
        seed=body.seed,
        idempotency_key=idempotency_key[:128],
    )
    return {
        "id": str(row.id),
        "status": row.status,
        "seed": row.seed,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
        "expiresAt": row.expires_at.isoformat() if row.expires_at else None,
    }


@router.get("/{challenge_id}")
async def get_one(
    challenge_id: UUID,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
) -> dict:
    row = await get_challenge(session, challenge_id, actor.user_id)
    return await serialize_challenge(session, row, viewer_id=actor.user_id)


@router.post("/{challenge_id}/accept")
async def post_accept(
    challenge_id: UUID,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
) -> dict:
    row = await accept_challenge(session, challenge_id, actor.user_id)
    return {"status": row.status, "seed": row.seed, "gameKey": row.game_key}


@router.post("/{challenge_id}/decline")
async def post_decline(
    challenge_id: UUID,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
) -> dict:
    row = await decline_challenge(session, challenge_id, actor.user_id)
    return {"status": row.status}
