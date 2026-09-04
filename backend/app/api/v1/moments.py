from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.auth import Actor, get_actor
from app.common.errors import AppError
from app.common.security import rate_limiter
from app.config import get_settings
from app.infrastructure.postgres.db import get_session
from app.infrastructure.postgres.models import CrowdSnapshot, Moment
from app.modules.feed.service import (
    friends_on_moment,
    my_response,
    serialize_moment,
    serialize_snapshot,
)
from app.modules.responses.service import submit_response
from app.modules.sharing.service import moment_share_card

router = APIRouter(prefix="/moments", tags=["moments"])


class ResponseIn(BaseModel):
    optionId: UUID


@router.get("/{moment_id}")
async def get_moment(
    moment_id: UUID,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(get_actor),
) -> dict:
    m = await session.get(Moment, moment_id, options=[selectinload(Moment.options), selectinload(Moment.category)])
    if m is None:
        raise AppError("not_found", "Moment not found.", 404)
    mine = await my_response(session, moment_id, actor.user_id, actor.guest_id)
    snap = await session.get(CrowdSnapshot, moment_id)
    payload = serialize_moment(m, snap, mine.option_id if mine else None)
    if actor.user_id:
        payload["friends"] = await friends_on_moment(session, actor.user_id, moment_id)
    return payload


@router.get("/{moment_id}/result")
async def get_result(
    moment_id: UUID,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(get_actor),
) -> dict:
    snap = await session.get(CrowdSnapshot, moment_id)
    if snap is None:
        raise AppError("not_found", "No result yet.", 404)
    return serialize_snapshot(moment_id, snap) or {}


@router.get("/{moment_id}/friends")
async def get_friends(
    moment_id: UUID,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(get_actor),
) -> dict:
    if not actor.user_id:
        return {"friends": []}
    return {"friends": await friends_on_moment(session, actor.user_id, moment_id)}


@router.post("/{moment_id}/responses")
async def post_response(
    moment_id: UUID,
    body: ResponseIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(get_actor),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    settings = get_settings()
    actor_key = str(actor.user_id or actor.guest_id)
    if not rate_limiter.allow(
        f"respond:{actor_key}",
        limit=settings.rate_limit_response_per_minute,
        window_seconds=60,
    ):
        raise AppError("rate_limited", "Too many responses. Slow down.", 429)
    return await submit_response(session, actor, moment_id, body.optionId, idempotency_key)


@router.post("/{moment_id}/share-card")
async def post_share_card(
    moment_id: UUID,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(get_actor),
) -> dict:
    return await moment_share_card(session, actor, moment_id)
