from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

import jwt
from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors import AppError
from app.common.security import hash_token
from app.config import Settings, get_settings
from app.infrastructure.postgres.db import get_session
from app.infrastructure.postgres.models import GuestSession, User

ActorKind = Literal["guest", "user"]


@dataclass
class Actor:
    kind: ActorKind
    guest_id: UUID | None = None
    user_id: UUID | None = None
    is_admin: bool = False
    engagements: int = 0

    @property
    def prompt_account_creation(self) -> bool:
        return self.kind == "guest" and self.engagements >= 3


def new_guest_token() -> str:
    return secrets.token_urlsafe(32)


async def get_actor(
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    authorization: str | None = Header(default=None),
) -> Actor:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AppError("unauthenticated", "Authentication required.", 401)
    token = authorization.split(" ", 1)[1].strip()
    if token.startswith("gst_"):
        return await _guest_actor(session, token)
    return await _user_actor(session, settings, token)


async def get_optional_actor(
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    authorization: str | None = Header(default=None),
) -> Actor | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if token.startswith("gst_"):
        return await _guest_actor(session, token)
    return await _user_actor(session, settings, token)


async def require_user(actor: Actor = Depends(get_actor)) -> Actor:
    if actor.kind != "user" or actor.user_id is None:
        raise AppError("user_required", "Sign in to continue.", 401)
    return actor


async def _guest_actor(session: AsyncSession, token: str) -> Actor:
    settings = get_settings()
    row = await session.scalar(
        select(GuestSession).where(GuestSession.token_hash == hash_token(token, settings.guest_token_secret))
    )
    if row is None or row.expires_at < datetime.now(UTC):
        raise AppError("unauthenticated", "Guest session expired.", 401)
    engagements = row.moments_responded_count + row.games_played_count
    return Actor(kind="guest", guest_id=row.id, engagements=engagements)


async def _user_actor(session: AsyncSession, settings: Settings, token: str) -> Actor:
    subject = _decode_subject(settings, token)
    user = await session.scalar(select(User).where(User.auth_subject == subject))
    if user is None:
        user = User(auth_subject=subject)
        session.add(user)
        await session.flush()
    if user.status != "active":
        raise AppError("forbidden", "Account is not active.", 403)
    return Actor(kind="user", user_id=user.id)


def _decode_subject(settings: Settings, token: str) -> str:
    if settings.supabase_jwt_secret:
        try:
            options: dict = {"verify_aud": bool(settings.supabase_jwt_audience)}
            decode_kwargs: dict = {
                "algorithms": ["HS256"],
                "options": options,
            }
            if settings.supabase_jwt_audience:
                decode_kwargs["audience"] = settings.supabase_jwt_audience
            if settings.supabase_jwt_issuer:
                decode_kwargs["issuer"] = settings.supabase_jwt_issuer
            payload = jwt.decode(token, settings.supabase_jwt_secret, **decode_kwargs)
            sub = payload.get("sub")
            if not sub:
                raise AppError("unauthenticated", "Invalid token.", 401)
            return str(sub)
        except jwt.PyJWTError as exc:
            raise AppError("unauthenticated", "Invalid token.", 401) from exc
    if settings.app_env == "production":
        raise AppError("unauthenticated", "Auth is not configured.", 401)
    # Development fallback: treat bearer as opaque subject so local flows work.
    return f"dev:{hash_token(token, settings.guest_token_secret)[:24]}"
