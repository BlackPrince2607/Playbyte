from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import new_guest_token
from app.common.errors import AppError
from app.common.security import hash_token, rate_limiter
from app.config import get_settings
from app.infrastructure.postgres.db import get_session
from app.infrastructure.postgres.models import GuestSession

router = APIRouter(prefix="/guest", tags=["guest"])


class GuestSessionOut(BaseModel):
    token: str
    expiresAt: datetime
    sessionId: str


@router.post("/sessions", response_model=GuestSessionOut)
async def create_guest_session(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> GuestSessionOut:
    settings = get_settings()
    client_ip = request.client.host if request.client else "unknown"
    if not rate_limiter.allow(
        f"guest:{client_ip}",
        limit=settings.rate_limit_guest_create_per_hour,
        window_seconds=3600,
    ):
        raise AppError("rate_limited", "Too many guest sessions. Try again later.", 429)
    raw = "gst_" + new_guest_token()
    expires = datetime.now(UTC) + timedelta(hours=settings.guest_session_ttl_hours)
    row = GuestSession(token_hash=hash_token(raw, settings.guest_token_secret), expires_at=expires)
    session.add(row)
    await session.flush()
    return GuestSessionOut(token=raw, expiresAt=expires, sessionId=str(row.id))
