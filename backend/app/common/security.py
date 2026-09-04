from __future__ import annotations

import hashlib
import hmac
import time
from collections import defaultdict
from dataclasses import dataclass, field

from app.config import Settings


def hash_token(raw: str, secret: str) -> str:
    """HMAC-SHA256 token digest; raw tokens must never be stored."""
    return hmac.new(secret.encode("utf-8"), raw.encode("utf-8"), hashlib.sha256).hexdigest()


DEFAULT_ADMIN_KEY = "dev-admin-key"
DEFAULT_GUEST_SECRET = "change-me-guest-token-secret"


def validate_production_settings(settings: Settings) -> list[str]:
    if settings.app_env != "production":
        return []
    errors: list[str] = []
    if settings.admin_api_key == DEFAULT_ADMIN_KEY or len(settings.admin_api_key) < 32:
        errors.append("ADMIN_API_KEY must be a strong secret (32+ chars) in production.")
    if settings.guest_token_secret == DEFAULT_GUEST_SECRET or len(settings.guest_token_secret) < 32:
        errors.append("GUEST_TOKEN_SECRET must be a strong secret (32+ chars) in production.")
    if not settings.supabase_jwt_secret:
        errors.append("SUPABASE_JWT_SECRET is required in production.")
    if not settings.supabase_url:
        errors.append("SUPABASE_URL is required in production.")
    if not settings.supabase_service_role_key:
        errors.append("SUPABASE_SERVICE_ROLE_KEY is required in production (server-side storage/realtime).")
    if "localhost" in settings.database_url or "127.0.0.1" in settings.database_url:
        errors.append("DATABASE_URL must not point to localhost in production.")
    if "localhost" in settings.api_public_url or "127.0.0.1" in settings.api_public_url:
        errors.append("API_PUBLIC_URL must be a public HTTPS URL in production.")
    if not settings.api_public_url.startswith("https://"):
        errors.append("API_PUBLIC_URL must use HTTPS in production.")
    if any(origin == "*" for origin in settings.cors_origin_list):
        errors.append("CORS must not allow wildcard origins in production.")
    for origin in settings.cors_origin_list:
        if origin.startswith("http://") and "localhost" not in origin:
            errors.append(f"CORS origin must use HTTPS in production: {origin}")
    return errors


@dataclass
class RateLimiter:
    """Simple in-memory sliding window limiter (per-process; use edge/WAF at scale)."""

    buckets: dict[str, list[float]] = field(default_factory=lambda: defaultdict(list))

    def allow(self, key: str, *, limit: int, window_seconds: int) -> bool:
        now = time.monotonic()
        window_start = now - window_seconds
        hits = [t for t in self.buckets[key] if t >= window_start]
        if len(hits) >= limit:
            self.buckets[key] = hits
            return False
        hits.append(now)
        self.buckets[key] = hits
        return True


rate_limiter = RateLimiter()
