from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.postgres.models import (
    Consent,
    DataRequest,
    Friendship,
    GamePlay,
    NotificationPreference,
    Profile,
    PushToken,
    Response,
    ShareCard,
    User,
    UserDailyStat,
    UserInterest,
)


async def build_export_payload(session: AsyncSession, user_id: UUID) -> dict:
    user = await session.get(User, user_id)
    profile = await session.get(Profile, user_id)
    responses = list(
        await session.scalars(select(Response).where(Response.user_id == user_id).order_by(Response.created_at))
    )
    plays = list(
        await session.scalars(select(GamePlay).where(GamePlay.user_id == user_id).order_by(GamePlay.created_at))
    )
    friends = list(
        await session.scalars(
            select(Friendship).where((Friendship.user_a == user_id) | (Friendship.user_b == user_id))
        )
    )
    consents = list(await session.scalars(select(Consent).where(Consent.user_id == user_id)))
    return {
        "exportedAt": datetime.now(UTC).isoformat(),
        "user": {
            "id": str(user_id),
            "status": user.status if user else None,
            "createdAt": user.created_at.isoformat() if user and user.created_at else None,
        },
        "profile": {
            "displayName": profile.display_name if profile else None,
            "bio": profile.bio,
            "defaultVisibility": profile.default_visibility if profile else None,
        },
        "responses": [
            {
                "momentId": str(r.moment_id),
                "optionId": str(r.option_id),
                "createdAt": r.created_at.isoformat(),
            }
            for r in responses
        ],
        "gamePlays": [
            {
                "gameKey": p.game_key,
                "score": p.score,
                "durationMs": p.duration_ms,
                "createdAt": p.created_at.isoformat(),
            }
            for p in plays
        ],
        "friendships": [
            {
                "id": str(f.id),
                "userA": str(f.user_a),
                "userB": str(f.user_b),
                "status": f.status,
            }
            for f in friends
        ],
        "consents": [
            {"kind": c.kind, "granted": c.granted, "createdAt": c.created_at.isoformat()} for c in consents
        ],
    }


async def complete_export(session: AsyncSession, request_id: UUID, user_id: UUID) -> str:
    payload = await build_export_payload(session, user_id)
    key = f"exports/{user_id}/{request_id}.json"
    data = json.dumps(payload, indent=2).encode("utf-8")
    from app.infrastructure.storage.objects import get_object_storage

    storage = get_object_storage()
    download_url = await storage.put_bytes("exports", key, data, "application/json")
    req = await session.get(DataRequest, request_id)
    if req:
        req.status = "complete"
        req.completed_at = datetime.now(UTC)
        req.download_key = key
    return download_url


async def complete_deletion(session: AsyncSession, user_id: UUID, request_id: UUID | None = None) -> None:
    user = await session.get(User, user_id)
    if user is None:
        return
    user.status = "deleted"
    user.auth_subject = f"deleted:{user_id}"
    user.date_of_birth = None
    profile = await session.get(Profile, user_id)
    if profile:
        profile.display_name = "Deleted user"
        profile.bio = None
        profile.avatar_key = None
    await session.execute(delete(PushToken).where(PushToken.user_id == user_id))
    await session.execute(delete(NotificationPreference).where(NotificationPreference.user_id == user_id))
    await session.execute(delete(UserInterest).where(UserInterest.user_id == user_id))
    await session.execute(delete(UserDailyStat).where(UserDailyStat.user_id == user_id))
    share_keys = list(
        await session.scalars(select(ShareCard.asset_key).where(ShareCard.user_id == user_id))
    )
    avatar_key = profile.avatar_key if profile else None
    export_keys = list(
        await session.scalars(select(DataRequest.download_key).where(DataRequest.user_id == user_id))
    )
    await session.execute(delete(ShareCard).where(ShareCard.user_id == user_id))
    await session.execute(
        delete(Friendship).where((Friendship.user_a == user_id) | (Friendship.user_b == user_id))
    )
    await session.execute(delete(Response).where(Response.user_id == user_id))
    await session.execute(delete(GamePlay).where(GamePlay.user_id == user_id))
    if request_id:
        req = await session.get(DataRequest, request_id)
        if req:
            req.status = "complete"
            req.completed_at = datetime.now(UTC)

    try:
        from app.infrastructure.storage.objects import get_object_storage

        storage = get_object_storage()
        for key in share_keys:
            if key:
                await storage.delete_object("share-cards", key)
        if avatar_key:
            await storage.delete_object("avatars", avatar_key)
        for key in export_keys:
            if key:
                await storage.delete_object("exports", key)
    except Exception:
        pass  # storage cleanup is best-effort; DB deletion is authoritative
