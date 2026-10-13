from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from uuid import UUID

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.infrastructure.postgres.models import (
    Consent,
    DataRequest,
    Friendship,
    GamePlay,
    MomentComment,
    MomentLike,
    MomentShare,
    NotificationPreference,
    Profile,
    PushToken,
    Response,
    ShareCard,
    User,
    UserDailyStat,
    UserInterest,
)

log = logging.getLogger(__name__)


async def delete_auth_user(subject: str | None) -> None:
    """Removes the Supabase Auth login (email, Google identity) behind a deleted account."""
    settings = get_settings()
    key = settings.supabase_service_role_key
    if not subject or subject.startswith("deleted:") or not (settings.supabase_url and key):
        return
    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{subject}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.delete(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    if res.status_code not in (200, 204, 404):
        raise RuntimeError(f"Auth user delete failed ({res.status_code})")


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
    comments = list(
        await session.scalars(
            select(MomentComment)
            .where(MomentComment.user_id == user_id, MomentComment.status != "deleted")
            .order_by(MomentComment.created_at)
        )
    )
    likes = list(
        await session.scalars(select(MomentLike).where(MomentLike.user_id == user_id).order_by(MomentLike.created_at))
    )
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
        "comments": [
            {"momentId": str(c.moment_id), "body": c.body, "createdAt": c.created_at.isoformat()} for c in comments
        ],
        "likes": [{"momentId": str(lk.moment_id), "createdAt": lk.created_at.isoformat()} for lk in likes],
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


async def export_download_url(key: str) -> str | None:
    """Short-lived link to a finished export; None if storage can't produce one right now."""
    from app.infrastructure.storage.objects import get_object_storage

    try:
        storage = get_object_storage()
        create_signed_url = getattr(storage, "create_signed_url", None)
        if create_signed_url is not None:
            return await create_signed_url("exports", key, expires_in=3600)
        return storage.public_url("exports", key)
    except Exception:  # noqa: BLE001 — the client shows "try again" rather than a 500
        log.warning("export_link_failed", extra={"key": key})
        return None


async def complete_deletion(session: AsyncSession, user_id: UUID, request_id: UUID | None = None) -> None:
    user = await session.get(User, user_id)
    if user is None:
        return
    auth_subject = user.auth_subject
    user.status = "deleted"
    user.auth_subject = f"deleted:{user_id}"
    user.date_of_birth = None
    profile = await session.get(Profile, user_id)
    avatar_key = profile.avatar_key if profile else None
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
    export_keys = list(
        await session.scalars(select(DataRequest.download_key).where(DataRequest.user_id == user_id))
    )
    await session.execute(delete(ShareCard).where(ShareCard.user_id == user_id))
    await session.execute(
        delete(Friendship).where((Friendship.user_a == user_id) | (Friendship.user_b == user_id))
    )
    await session.execute(delete(Response).where(Response.user_id == user_id))
    await session.execute(delete(MomentComment).where(MomentComment.user_id == user_id))
    await session.execute(delete(MomentLike).where(MomentLike.user_id == user_id))
    await session.execute(delete(MomentShare).where(MomentShare.user_id == user_id))
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

    try:
        await delete_auth_user(auth_subject)
    except Exception:  # noqa: BLE001 — the account is already anonymised; ops can retry from the log
        log.exception("auth_user_delete_failed", extra={"user_id": str(user_id)})
