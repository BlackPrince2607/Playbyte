from uuid import UUID

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import Actor, require_user
from app.common.errors import AppError
from app.infrastructure.postgres.db import get_session
from app.modules.matchmaking import service as mm

router = APIRouter(prefix="/matchmaking", tags=["matchmaking"])


class TicketIn(BaseModel):
    gameKey: str | None = Field(default=None, min_length=1, max_length=80)
    preferredOpponentUserId: UUID | None = None
    extend: bool = False


class HeartbeatIn(BaseModel):
    ticketId: UUID | None = None


@router.post("/tickets")
async def post_ticket(
    body: TicketIn,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    if not idempotency_key:
        raise AppError("idempotency_required", "Idempotency-Key header is required.", 400)
    ticket = await mm.enqueue_ticket(
        session,
        actor.user_id,
        game_key=body.gameKey,
        idempotency_key=idempotency_key[:128],
        preferred_opponent_id=body.preferredOpponentUserId,
        extend_existing=body.extend,
    )
    return await mm.serialize_ticket(session, ticket)


@router.get("/tickets/{ticket_id}")
async def get_ticket(
    ticket_id: UUID,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
) -> dict:
    ticket = await mm.get_ticket(session, ticket_id, actor.user_id)
    return await mm.serialize_ticket(session, ticket)


@router.delete("/tickets/{ticket_id}")
async def delete_ticket(
    ticket_id: UUID,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
) -> dict:
    ticket = await mm.cancel_ticket(session, ticket_id, actor.user_id)
    return {"id": str(ticket.id), "status": ticket.status}


@router.post("/heartbeat")
async def post_heartbeat(
    body: HeartbeatIn,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
) -> dict:
    return await mm.heartbeat(session, actor.user_id, body.ticketId)
