from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import Actor, get_actor, require_user
from app.common.errors import AppError
from app.common.security import hash_token
from app.config import get_settings
from app.infrastructure.postgres.db import get_session
from app.infrastructure.postgres.models import (
    Category,
    Consent,
    DataRequest,
    GamePlay,
    GuestInterest,
    GuestSession,
    NotificationPreference,
    Profile,
    PushToken,
    Response,
    User,
    UserInterest,
)
from app.modules.recap.service import weekly_recap

router = APIRouter(prefix="/me", tags=["me"])


class ProfileIn(BaseModel):
    displayName: str | None = Field(default=None, max_length=40)
    bio: str | None = Field(default=None, max_length=160)
    avatarKey: str | None = None


class PrivacyIn(BaseModel):
    defaultVisibility: str


class InterestsIn(BaseModel):
    categoryIds: list[UUID]


class PushTokenIn(BaseModel):
    platform: str
    token: str


class NotifPrefsIn(BaseModel):
    liveNow: bool | None = None
    trending: bool | None = None
    friendActivity: bool | None = None


class DataRequestIn(BaseModel):
    type: str


class ConvertIn(BaseModel):
    guestToken: str
    dateOfBirth: date | None = None


def _age_years(dob: date) -> int:
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


@router.get("")
async def get_me(session: AsyncSession = Depends(get_session), actor: Actor = Depends(require_user)) -> dict:
    user = await session.get(User, actor.user_id)
    profile = await session.get(Profile, actor.user_id)
    if profile is None:
        profile = Profile(user_id=actor.user_id)
        session.add(profile)
        await session.flush()
    return {
        "id": str(user.id),
        "displayName": profile.display_name,
        "bio": profile.bio,
        "avatarKey": profile.avatar_key,
        "defaultVisibility": profile.default_visibility,
        "ageVerified": user.age_verified,
    }


@router.patch("/profile")
async def patch_profile(
    body: ProfileIn,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
) -> dict:
    profile = await session.get(Profile, actor.user_id)
    if profile is None:
        profile = Profile(user_id=actor.user_id)
        session.add(profile)
    if body.displayName is not None:
        profile.display_name = body.displayName.strip() or "Player"
    if body.bio is not None:
        profile.bio = body.bio
    if body.avatarKey is not None:
        profile.avatar_key = body.avatarKey
    return {"ok": True}


@router.patch("/privacy")
async def patch_privacy(
    body: PrivacyIn,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
) -> dict:
    if body.defaultVisibility not in {"public", "friends", "private"}:
        raise AppError("invalid", "Invalid visibility.", 422)
    profile = await session.get(Profile, actor.user_id)
    if profile is None:
        profile = Profile(user_id=actor.user_id)
        session.add(profile)
    profile.default_visibility = body.defaultVisibility
    return {"ok": True}


@router.get("/interests")
async def get_interests(
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(get_actor),
) -> dict:
    cats = {c.id: c for c in await session.scalars(select(Category))}
    if actor.user_id:
        ids = list(await session.scalars(select(UserInterest.category_id).where(UserInterest.user_id == actor.user_id)))
    else:
        ids = list(
            await session.scalars(
                select(GuestInterest.category_id).where(GuestInterest.guest_session_id == actor.guest_id)
            )
        )
    return {"categories": [{"id": str(i), "slug": cats[i].slug, "name": cats[i].name} for i in ids if i in cats]}


@router.put("/interests")
async def put_interests(
    body: InterestsIn,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(get_actor),
) -> dict:
    if actor.user_id:
        await session.execute(delete(UserInterest).where(UserInterest.user_id == actor.user_id))
        for cid in body.categoryIds:
            session.add(UserInterest(user_id=actor.user_id, category_id=cid))
    else:
        await session.execute(delete(GuestInterest).where(GuestInterest.guest_session_id == actor.guest_id))
        for cid in body.categoryIds:
            session.add(GuestInterest(guest_session_id=actor.guest_id, category_id=cid))
    return {"ok": True}


@router.get("/recap/weekly")
async def get_recap(session: AsyncSession = Depends(get_session), actor: Actor = Depends(require_user)) -> dict:
    return await weekly_recap(session, actor.user_id)


@router.post("/push-tokens")
async def post_push(
    body: PushTokenIn,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
) -> dict:
    existing = await session.scalar(select(PushToken).where(PushToken.token == body.token))
    if existing and existing.user_id != actor.user_id:
        raise AppError("conflict", "Push token already registered.", 409)
    if existing is None:
        session.add(PushToken(user_id=actor.user_id, platform=body.platform, token=body.token))
    return {"ok": True}


@router.get("/notification-preferences")
async def get_notif(
    session: AsyncSession = Depends(get_session), actor: Actor = Depends(require_user)
) -> dict:
    prefs = await session.get(NotificationPreference, actor.user_id)
    if prefs is None:
        return {"liveNow": True, "trending": True, "friendActivity": True}
    return {
        "liveNow": prefs.live_now,
        "trending": prefs.trending,
        "friendActivity": prefs.friend_activity,
    }


@router.patch("/notification-preferences")
async def patch_notif(
    body: NotifPrefsIn,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
) -> dict:
    prefs = await session.get(NotificationPreference, actor.user_id)
    if prefs is None:
        prefs = NotificationPreference(user_id=actor.user_id)
        session.add(prefs)
    if body.liveNow is not None:
        prefs.live_now = body.liveNow
    if body.trending is not None:
        prefs.trending = body.trending
    if body.friendActivity is not None:
        prefs.friend_activity = body.friendActivity
    return {"ok": True}


@router.post("/data-requests")
async def post_data_request(
    body: DataRequestIn,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
) -> dict:
    if body.type not in {"export", "deletion"}:
        raise AppError("invalid", "type must be export or deletion.", 422)
    row = DataRequest(user_id=actor.user_id, type=body.type)
    session.add(row)
    await session.flush()
    from app.infrastructure.queue.outbox import enqueue

    await enqueue(session, f"data.{body.type}", {"requestId": str(row.id), "userId": str(actor.user_id)})
    return {"id": str(row.id), "status": row.status}


@router.get("/data-requests/{request_id}")
async def get_data_request(
    request_id: UUID,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
) -> dict:
    row = await session.get(DataRequest, request_id)
    if row is None or row.user_id != actor.user_id:
        raise AppError("not_found", "Request not found.", 404)
    return {"id": str(row.id), "type": row.type, "status": row.status, "downloadKey": row.download_key}


@router.post("/consents")
async def post_consent(
    kind: str,
    granted: bool,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
) -> dict:
    session.add(Consent(user_id=actor.user_id, kind=kind, granted=granted))
    return {"ok": True}


@router.post("/convert-guest")
async def convert_guest(
    body: ConvertIn,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
) -> dict:
    if body.dateOfBirth and _age_years(body.dateOfBirth) < 13:
        raise AppError("forbidden", "Playbyte is not available under the minimum age.", 403)
    settings = get_settings()
    guest = await session.scalar(
        select(GuestSession).where(GuestSession.token_hash == hash_token(body.guestToken, settings.guest_token_secret))
    )
    if guest is None:
        raise AppError("not_found", "Guest session not found.", 404)
    guest.converted_user_id = actor.user_id
    await session.execute(
        update(Response)
        .where(Response.guest_session_id == guest.id)
        .values(user_id=actor.user_id, guest_session_id=None)
    )
    await session.execute(
        update(GamePlay)
        .where(GamePlay.guest_session_id == guest.id)
        .values(user_id=actor.user_id, guest_session_id=None)
    )
    guest_interests = list(
        await session.scalars(select(GuestInterest.category_id).where(GuestInterest.guest_session_id == guest.id))
    )
    for cid in guest_interests:
        exists = await session.scalar(
            select(UserInterest.category_id).where(
                UserInterest.user_id == actor.user_id, UserInterest.category_id == cid
            )
        )
        if not exists:
            session.add(UserInterest(user_id=actor.user_id, category_id=cid))
    user = await session.get(User, actor.user_id)
    if body.dateOfBirth:
        user.date_of_birth = body.dateOfBirth
        user.age_verified = _age_years(body.dateOfBirth) >= 13
    if await session.get(Profile, actor.user_id) is None:
        session.add(Profile(user_id=actor.user_id))
    return {"ok": True}


@router.get("/categories")
async def list_categories(session: AsyncSession = Depends(get_session)) -> dict:
    rows = await session.scalars(select(Category).order_by(Category.sort_order))
    return {"categories": [{"id": str(c.id), "slug": c.slug, "name": c.name} for c in rows]}
