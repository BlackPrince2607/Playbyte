from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from pydantic import BaseModel, Field
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
    tags_for_moments,
)
from app.modules.responses.service import submit_response
from app.modules.sharing.service import moment_share_card
from app.modules.social.service import (
    add_comment,
    delete_comment,
    engagement_for,
    list_comments,
    record_share,
    set_like,
)

router = APIRouter(prefix="/moments", tags=["moments"])


class ResponseIn(BaseModel):
    optionId: UUID


class ShareIn(BaseModel):
    channel: str | None = Field(default=None, max_length=40)


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


def _limit_social(actor: Actor, bucket: str, limit: int) -> None:
    if not rate_limiter.allow(f"{bucket}:{actor.user_id or actor.guest_id}", limit=limit, window_seconds=60):
        raise AppError("rate_limited", "Slow down a little.", 429)


@router.get("/{moment_id}")
async def get_moment(
    moment_id: UUID,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(get_actor),
    lang: str | None = Query(default=None, max_length=16),
) -> dict:
    m = await session.get(Moment, moment_id, options=[selectinload(Moment.options), selectinload(Moment.category)])
    if m is None:
        raise AppError("not_found", "Moment not found.", 404)
    mine = await my_response(session, moment_id, actor.user_id, actor.guest_id)
    snap = await session.get(CrowdSnapshot, moment_id)
    tags = (await tags_for_moments(session, [moment_id])).get(moment_id, [])
    payload = serialize_moment(
        m,
        snap,
        mine.option_id if mine else None,
        tags=tags,
        reveal_correct=bool(mine),
        lang=lang,
    )
    payload["engagement"] = (await engagement_for(session, [moment_id], actor.user_id, actor.guest_id))[moment_id]
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
    correct_id = None
    mine = await my_response(session, moment_id, actor.user_id, actor.guest_id)
    if mine:
        m = await session.get(Moment, moment_id, options=[selectinload(Moment.options)])
        if m and m.scoring_mode == "correct_option":
            for o in m.options:
                if o.is_correct:
                    correct_id = str(o.id)
                    break
    return serialize_snapshot(moment_id, snap, correct_option_id=correct_id) or {}


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


@router.put("/{moment_id}/like")
async def put_like(
    moment_id: UUID,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(get_actor),
) -> dict:
    _limit_social(actor, "like", get_settings().rate_limit_social_per_minute)
    return await set_like(session, actor, moment_id, liked=True)


@router.delete("/{moment_id}/like")
async def delete_like(
    moment_id: UUID,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(get_actor),
) -> dict:
    _limit_social(actor, "like", get_settings().rate_limit_social_per_minute)
    return await set_like(session, actor, moment_id, liked=False)


@router.post("/{moment_id}/shares")
async def post_share(
    moment_id: UUID,
    body: ShareIn | None = None,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(get_actor),
) -> dict:
    _limit_social(actor, "share", get_settings().rate_limit_social_per_minute)
    return await record_share(session, actor, moment_id, body.channel if body else None)


@router.get("/{moment_id}/comments")
async def get_comments(
    moment_id: UUID,
    cursor: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=20, ge=1, le=50),
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(get_actor),
) -> dict:
    return await list_comments(session, actor, moment_id, cursor=cursor, limit=limit)


@router.post("/{moment_id}/comments")
async def post_comment(
    moment_id: UUID,
    body: CommentIn,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(get_actor),
) -> dict:
    _limit_social(actor, "comment", get_settings().rate_limit_comments_per_minute)
    return await add_comment(session, actor, moment_id, body.body)


@router.delete("/{moment_id}/comments/{comment_id}")
async def remove_comment(
    moment_id: UUID,
    comment_id: UUID,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(get_actor),
) -> dict:
    return await delete_comment(session, actor, moment_id, comment_id)
