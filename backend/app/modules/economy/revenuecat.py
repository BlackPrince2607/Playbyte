"""Verify a consumable with RevenueCat before any coins are credited.

The client sends a transaction id. Coins are granted only when that id appears on the
RevenueCat subscriber for this Maja user. The webhook uses the same match.
"""

from __future__ import annotations

import hmac

import httpx

from app.common.errors import AppError
from app.config import get_settings


def webhook_authorized(expected: str, presented: str | None) -> bool:
    if not expected or not presented:
        return False
    return hmac.compare_digest(presented, expected)


def find_purchase(subscriber: dict, product_id: str, transaction_id: str) -> dict | None:
    body = subscriber.get("subscriber") if isinstance(subscriber.get("subscriber"), dict) else subscriber
    if not isinstance(body, dict):
        return None
    non_subs = body.get("non_subscriptions") or {}
    if not isinstance(non_subs, dict):
        return None
    items = non_subs.get(product_id) or []
    if not isinstance(items, list):
        return None
    for item in items:
        if not isinstance(item, dict):
            continue
        ids = {str(item.get("id") or ""), str(item.get("store_transaction_id") or "")}
        ids.discard("")
        if transaction_id in ids:
            return item
    return None


def canonical_transaction_id(item: dict) -> str:
    return str(item.get("store_transaction_id") or item.get("id") or "")


async def fetch_subscriber(app_user_id: str) -> dict:
    key = get_settings().revenuecat_secret_api_key
    if not key:
        raise AppError("purchases_unavailable", "Coin packs are not available yet.", 503)
    url = f"https://api.revenuecat.com/v1/subscribers/{app_user_id}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        res = await client.get(
            url,
            headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
        )
    if res.status_code != 200:
        raise AppError("purchase_unverified", "Could not verify that purchase.", 402)
    data = res.json()
    if not isinstance(data, dict):
        raise AppError("purchase_unverified", "Could not verify that purchase.", 402)
    return data
