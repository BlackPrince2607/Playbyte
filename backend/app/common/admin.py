
import hmac

from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import Actor, _user_actor
from app.common.errors import AppError
from app.common.security import rate_limiter
from app.config import Settings, get_settings
from app.infrastructure.postgres.db import get_session
from app.infrastructure.postgres.models import AdminUser


async def require_admin(
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    x_admin_key: str | None = Header(default=None, alias="X-Admin-Key"),
    authorization: str | None = Header(default=None),
) -> Actor:
    if settings.app_env != "production":
        if x_admin_key and hmac.compare_digest(x_admin_key, settings.admin_api_key):
            return Actor(kind="user", is_admin=True)

    client_key = x_admin_key or "jwt"
    if not rate_limiter.allow(f"admin:{client_key}", limit=30, window_seconds=60):
        raise AppError("rate_limited", "Too many admin attempts.", 429)

    if not authorization or not authorization.lower().startswith("bearer "):
        raise AppError("forbidden", "Admin access required.", 403)
    token = authorization.split(" ", 1)[1].strip()
    if token.startswith("gst_"):
        raise AppError("forbidden", "Admin access required.", 403)
    actor = await _user_actor(session, settings, token)
    admin = await session.get(AdminUser, actor.user_id)
    if not admin:
        raise AppError("forbidden", "Admin access required.", 403)
    actor.is_admin = True
    return actor
