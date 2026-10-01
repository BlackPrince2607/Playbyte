from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import Actor, require_user
from app.infrastructure.postgres.db import get_session
from app.modules.friends.service import (
    accept_friend,
    delete_friend_request,
    list_friend_requests,
    list_friends,
    remove_friend,
    request_friend,
)

router = APIRouter(prefix="/friends", tags=["friends"])


class FriendRequestIn(BaseModel):
    userId: UUID


@router.get("")
async def get_friends(session: AsyncSession = Depends(get_session), actor: Actor = Depends(require_user)) -> dict:
    return {"friends": await list_friends(session, actor.user_id)}


@router.get("/requests")
async def get_requests(
    session: AsyncSession = Depends(get_session), actor: Actor = Depends(require_user)
) -> dict:
    return await list_friend_requests(session, actor.user_id)


@router.post("/requests")
async def post_request(
    body: FriendRequestIn,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
) -> dict:
    row = await request_friend(session, actor.user_id, body.userId)
    return {"id": str(row.id), "status": row.status}


@router.post("/requests/{request_id}/accept")
async def post_accept(
    request_id: UUID,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
) -> dict:
    row = await accept_friend(session, actor.user_id, request_id)
    return {"id": str(row.id), "status": row.status}


@router.delete("/requests/{request_id}")
async def delete_request(
    request_id: UUID,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
) -> dict:
    await delete_friend_request(session, actor.user_id, request_id)
    return {"ok": True}


@router.delete("/{friend_id}")
async def delete_friend(
    friend_id: UUID,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
) -> dict:
    await remove_friend(session, actor.user_id, friend_id)
    return {"ok": True}
