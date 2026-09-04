from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.admin import require_admin
from app.common.auth import Actor
from app.infrastructure.postgres.db import get_session
from app.infrastructure.postgres.models import (
    ContentWindow,
    MiniGame,
    Moment,
    Report,
)
from app.modules.cms.service import approve_moment, create_moment, transition_moment

router = APIRouter(prefix="/admin", tags=["admin"])


class MomentCreateIn(BaseModel):
    type: str
    categoryId: UUID
    prompt: str
    options: list[str]
    restrictedTopic: str = "none"
    contentWindowId: UUID | None = None
    startsAt: datetime | None = None
    endsAt: datetime | None = None


class TransitionIn(BaseModel):
    status: str


class ApproveIn(BaseModel):
    decision: str = "approve"
    approverId: UUID | None = None


class WindowIn(BaseModel):
    slug: str
    title: str
    categoryId: UUID | None = None
    startsAt: datetime
    endsAt: datetime
    priority: int = 0
    status: str = "draft"


class GameToggleIn(BaseModel):
    status: str


@router.get("/moments")
async def list_moments(
    session: AsyncSession = Depends(get_session),
    _: Actor = Depends(require_admin),
) -> dict:
    rows = await session.scalars(select(Moment).options(selectinload(Moment.options)).order_by(Moment.created_at.desc()))
    return {
        "moments": [
            {
                "id": str(m.id),
                "type": m.type,
                "status": m.status,
                "prompt": m.prompt,
                "restrictedTopic": m.restricted_topic,
                "startsAt": m.starts_at.isoformat() if m.starts_at else None,
                "endsAt": m.ends_at.isoformat() if m.ends_at else None,
                "options": [o.label for o in sorted(m.options, key=lambda x: x.sort_order)],
            }
            for m in rows
        ]
    }


@router.post("/moments")
async def post_moment(
    body: MomentCreateIn,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_admin),
) -> dict:
    m = await create_moment(
        session,
        actor_id=actor.user_id,
        moment_type=body.type,
        category_id=body.categoryId,
        prompt=body.prompt,
        options=body.options,
        restricted_topic=body.restrictedTopic,
        content_window_id=body.contentWindowId,
        starts_at=body.startsAt,
        ends_at=body.endsAt,
    )
    return {"id": str(m.id), "status": m.status}


@router.post("/moments/{moment_id}/transition")
async def post_transition(
    moment_id: UUID,
    body: TransitionIn,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_admin),
) -> dict:
    m = await transition_moment(session, moment_id, body.status, actor.user_id)
    return {"id": str(m.id), "status": m.status}


@router.post("/moments/{moment_id}/approvals")
async def post_approval(
    moment_id: UUID,
    body: ApproveIn,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_admin),
) -> dict:
    approver = body.approverId or actor.user_id
    await approve_moment(session, moment_id, approver, body.decision)
    return {"ok": True}


@router.get("/windows")
async def list_windows(
    session: AsyncSession = Depends(get_session),
    _: Actor = Depends(require_admin),
) -> dict:
    rows = await session.scalars(select(ContentWindow).order_by(ContentWindow.starts_at.desc()))
    return {
        "windows": [
            {
                "id": str(w.id),
                "slug": w.slug,
                "title": w.title,
                "startsAt": w.starts_at.isoformat(),
                "endsAt": w.ends_at.isoformat(),
                "status": w.status,
                "priority": w.priority,
            }
            for w in rows
        ]
    }


@router.post("/windows")
async def post_window(
    body: WindowIn,
    session: AsyncSession = Depends(get_session),
    _: Actor = Depends(require_admin),
) -> dict:
    w = ContentWindow(
        slug=body.slug,
        title=body.title,
        category_id=body.categoryId,
        starts_at=body.startsAt,
        ends_at=body.endsAt,
        priority=body.priority,
        status=body.status,
    )
    session.add(w)
    await session.flush()
    return {"id": str(w.id)}


@router.get("/reports")
async def list_reports(
    session: AsyncSession = Depends(get_session),
    _: Actor = Depends(require_admin),
) -> dict:
    rows = await session.scalars(select(Report).order_by(Report.created_at.desc()).limit(100))
    return {
        "reports": [
            {
                "id": str(r.id),
                "targetType": r.target_type,
                "targetId": r.target_id,
                "reason": r.reason,
                "status": r.status,
            }
            for r in rows
        ]
    }


@router.patch("/games/{game_key}")
async def patch_game(
    game_key: str,
    body: GameToggleIn,
    session: AsyncSession = Depends(get_session),
    _: Actor = Depends(require_admin),
) -> dict:
    g = await session.get(MiniGame, game_key)
    if g:
        g.status = body.status
    return {"ok": True}
