import json
import re

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import Actor, get_actor
from app.common.errors import AppError
from app.common.security import rate_limiter
from app.config import get_settings
from app.infrastructure.postgres.db import get_session
from app.modules.analytics.service import record_events

router = APIRouter(prefix="/events", tags=["events"])

MAX_BATCH = 100
MAX_PROPS_BYTES = 2_000

_TYPE_RE = re.compile(r"^[A-Z][A-Z_]{1,39}$")
_NAME_RE = re.compile(r"^[a-z][a-z0-9_]{0,59}$")


class EventIn(BaseModel):
    type: str = Field(max_length=40)
    name: str | None = Field(default=None, max_length=60)
    sessionId: str = Field(min_length=1, max_length=80)
    gameKey: str = Field(min_length=1, max_length=80)
    engineId: str | None = Field(default=None, max_length=40)
    engineVersion: int | None = Field(default=None, ge=0, le=10_000)
    variation: str | None = Field(default=None, max_length=60)
    round: int | None = Field(default=None, ge=0, le=10_000)
    seed: str | None = Field(default=None, max_length=80)
    clockMs: int | None = Field(default=None, ge=0, le=86_400_000)
    ts: int | None = Field(default=None, ge=0)
    props: dict | None = None

    @field_validator("type")
    @classmethod
    def _type(cls, v: str) -> str:
        if not _TYPE_RE.match(v):
            raise ValueError("invalid event type")
        return v

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is not None and not _NAME_RE.match(v):
            raise ValueError("invalid event name")
        return v

    @field_validator("props")
    @classmethod
    def _props(cls, v: dict | None) -> dict | None:
        # Oversized props are replaced rather than rejected so one noisy event cannot sink a batch.
        if v is not None and len(json.dumps(v, separators=(",", ":"))) > MAX_PROPS_BYTES:
            return {"truncated": True}
        return v


class EventBatchIn(BaseModel):
    events: list[EventIn] = Field(min_length=1, max_length=MAX_BATCH)
    appVersion: str | None = Field(default=None, max_length=40)


@router.post("")
async def post_events(
    body: EventBatchIn,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(get_actor),
) -> dict:
    """Batched gameplay analytics. Fire-and-forget for the client; rate-limited per actor."""
    settings = get_settings()
    if not rate_limiter.allow(
        f"events:{actor.user_id or actor.guest_id}",
        limit=settings.rate_limit_event_batches_per_minute,
        window_seconds=60,
    ):
        raise AppError("rate_limited", "Too many analytics batches.", 429)
    return await record_events(session, actor, [e.model_dump() for e in body.events], body.appVersion)
