from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import Actor, require_user
from app.common.errors import AppError
from app.common.security import rate_limiter
from app.config import get_settings
from app.infrastructure.postgres.db import get_session
from app.infrastructure.postgres.models import User
from app.modules.economy.revenuecat import (
    canonical_transaction_id,
    fetch_subscriber,
    find_purchase,
    webhook_authorized,
)
from app.modules.economy.rules import pack_coins, parse_local_date
from app.modules.economy.service import (
    buy_freeze,
    claim_streak,
    credit_purchase,
    grant_welcome,
    spend_hint,
    wallet_view,
)

router = APIRouter(prefix="/me", tags=["economy"])
webhook_router = APIRouter(tags=["economy"])


class ClaimIn(BaseModel):
    migrateCount: int | None = Field(default=None, ge=0, le=10_000)
    migrateDate: str | None = Field(default=None, max_length=10)


class HintSpendIn(BaseModel):
    engine: str = Field(min_length=1, max_length=40)
    hintId: str = Field(min_length=1, max_length=40)


class PurchaseSyncIn(BaseModel):
    productId: str = Field(min_length=1, max_length=64)
    transactionId: str = Field(min_length=1, max_length=256)


def _local_day(raw: str | None):
    return parse_local_date(raw)


@router.get("/wallet")
async def get_wallet(
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
    x_local_date: str | None = Header(default=None, alias="X-Local-Date"),
) -> dict:
    await grant_welcome(session, actor.user_id)
    return await wallet_view(session, actor.user_id, _local_day(x_local_date))


@router.post("/streak/claim")
async def post_streak_claim(
    body: ClaimIn,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
    x_local_date: str | None = Header(default=None, alias="X-Local-Date"),
) -> dict:
    return await claim_streak(
        session,
        actor.user_id,
        _local_day(x_local_date),
        migrate_count=body.migrateCount,
        migrate_date=body.migrateDate,
    )


@router.post("/hints/spend")
async def post_hint_spend(
    body: HintSpendIn,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    x_local_date: str | None = Header(default=None, alias="X-Local-Date"),
) -> dict:
    if not rate_limiter.allow(f"hint:{actor.user_id}", limit=30, window_seconds=60):
        raise AppError("rate_limited", "Too many hints. Slow down.", 429)
    return await spend_hint(
        session,
        actor.user_id,
        engine=body.engine,
        hint_id=body.hintId,
        idempotency_key=idempotency_key or "",
        local_day=_local_day(x_local_date),
    )


@router.post("/streak/freeze")
async def post_streak_freeze(
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    x_local_date: str | None = Header(default=None, alias="X-Local-Date"),
) -> dict:
    return await buy_freeze(session, actor.user_id, idempotency_key or "", _local_day(x_local_date))


@router.post("/purchases/sync")
async def post_purchase_sync(
    body: PurchaseSyncIn,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(require_user),
    x_local_date: str | None = Header(default=None, alias="X-Local-Date"),
) -> dict:
    if pack_coins(body.productId) is None:
        raise AppError("invalid", "Unknown coin pack.", 422)
    subscriber = await fetch_subscriber(str(actor.user_id))
    item = find_purchase(subscriber, body.productId, body.transactionId)
    if item is None:
        raise AppError("purchase_unverified", "Could not verify that purchase.", 402)
    transaction_id = canonical_transaction_id(item)
    if not transaction_id:
        raise AppError("purchase_unverified", "Could not verify that purchase.", 402)
    store = str(item.get("store") or "unknown")
    return await credit_purchase(
        session,
        actor.user_id,
        store=store,
        store_transaction_id=transaction_id,
        product_id=body.productId,
        local_day=_local_day(x_local_date),
    )


@webhook_router.post("/webhooks/revenuecat")
async def revenuecat_webhook(request: Request, session: AsyncSession = Depends(get_session)) -> dict:
    settings = get_settings()
    if not webhook_authorized(settings.revenuecat_webhook_authorization, request.headers.get("authorization")):
        raise AppError("unauthenticated", "Invalid webhook.", 401)
    body = await request.json()
    event = body.get("event") if isinstance(body, dict) else None
    if not isinstance(event, dict) or event.get("type") != "NON_RENEWING_PURCHASE":
        return {"ok": True}
    product_id = str(event.get("product_id") or "")
    if pack_coins(product_id) is None:
        return {"ok": True, "ignored": True}
    raw_user = str(event.get("app_user_id") or "")
    try:
        user_id = UUID(raw_user)
    except ValueError:
        return {"ok": True, "ignored": True}
    if await session.get(User, user_id) is None:
        return {"ok": True, "ignored": True}
    transaction_id = str(event.get("transaction_id") or event.get("store_transaction_id") or "")
    if not transaction_id:
        raise AppError("purchase_unverified", "Could not verify that purchase.", 402)
    subscriber = await fetch_subscriber(raw_user)
    item = find_purchase(subscriber, product_id, transaction_id)
    if item is None:
        raise AppError("purchase_unverified", "Could not verify that purchase.", 402)
    canonical = canonical_transaction_id(item)
    if not canonical:
        raise AppError("purchase_unverified", "Could not verify that purchase.", 402)
    view = await credit_purchase(
        session,
        user_id,
        store=str(event.get("store") or item.get("store") or "unknown"),
        store_transaction_id=canonical,
        product_id=product_id,
        local_day=None,
    )
    return {"ok": True, "coinsEarned": view.get("coinsEarned", 0)}
