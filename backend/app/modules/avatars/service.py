from __future__ import annotations

import logging
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors import AppError
from app.infrastructure.postgres.models import Profile
from app.infrastructure.storage.objects import get_object_storage
from app.infrastructure.storage.validation import MAX_BYTES, StorageValidationError

log = logging.getLogger(__name__)

BUCKET = "avatars"
MAX_AVATAR_BYTES = MAX_BYTES[BUCKET]
_EXT = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}


def sniff_image_type(data: bytes) -> str | None:
    """The declared content type is client-controlled, so the bytes must agree with it."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def owns_avatar_key(user_id: UUID, key: str | None) -> bool:
    return bool(key) and key.startswith(f"users/{user_id}/") and ".." not in key


async def _profile(session: AsyncSession, user_id: UUID) -> Profile:
    profile = await session.get(Profile, user_id)
    if profile is None:
        profile = Profile(user_id=user_id)
        session.add(profile)
    return profile


async def _delete_quietly(key: str) -> None:
    try:
        await get_object_storage().delete_object(BUCKET, key)
    except Exception:  # noqa: BLE001 — a leftover file must not fail the profile change
        log.warning("avatar_delete_failed", extra={"key": key})


async def store_avatar(session: AsyncSession, user_id: UUID, data: bytes, content_type: str) -> dict:
    if not data:
        raise AppError("invalid", "Choose a photo to upload.", 422)
    if len(data) > MAX_AVATAR_BYTES:
        raise AppError("invalid", "That photo is too large. Pick one under 2 MB.", 422)
    sniffed = sniff_image_type(data)
    if sniffed is None or sniffed != content_type:
        raise AppError("invalid", "Avatars must be PNG, JPEG or WebP images.", 422)

    key = f"users/{user_id}/{uuid4().hex}.{_EXT[sniffed]}"
    try:
        url = await get_object_storage().put_bytes(BUCKET, key, data, sniffed)
    except StorageValidationError as exc:
        raise AppError("invalid", str(exc), 422) from exc
    except Exception as exc:  # noqa: BLE001 — storage misconfig must surface as 503, not an opaque 500
        raise AppError("storage_unavailable", "Avatar storage is unavailable. Try again later.", 503) from exc

    profile = await _profile(session, user_id)
    previous = profile.avatar_key
    profile.avatar_key = key
    if owns_avatar_key(user_id, previous) and previous != key:
        await _delete_quietly(previous)
    return {"avatarKey": key, "url": url}


async def remove_avatar(session: AsyncSession, user_id: UUID) -> None:
    profile = await session.get(Profile, user_id)
    if profile is None or not profile.avatar_key:
        return
    previous = profile.avatar_key
    profile.avatar_key = None
    if owns_avatar_key(user_id, previous):
        await _delete_quietly(previous)
