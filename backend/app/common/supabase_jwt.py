"""Verify Supabase user access tokens (legacy HS256 + asymmetric JWKS)."""

from __future__ import annotations

import threading
import time
from typing import Any

import httpx
import jwt
from jwt.algorithms import ECAlgorithm, OKPAlgorithm, RSAAlgorithm

from app.common.errors import AppError
from app.config import Settings

_JWKS_TTL_SECONDS = 600
_jwks_lock = threading.Lock()
_jwks_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def _issuer_for(settings: Settings) -> str | None:
    if settings.supabase_jwt_issuer:
        return settings.supabase_jwt_issuer
    if settings.supabase_url:
        return f"{settings.supabase_url.rstrip('/')}/auth/v1"
    return None


def _jwks_url(settings: Settings) -> str | None:
    if not settings.supabase_url:
        return None
    return f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"


def _fetch_jwks(url: str) -> dict[str, Any]:
    now = time.monotonic()
    with _jwks_lock:
        cached = _jwks_cache.get(url)
        if cached and cached[0] > now:
            return cached[1]

    response = httpx.get(url, timeout=8.0)
    response.raise_for_status()
    body = response.json()
    if not isinstance(body, dict) or "keys" not in body:
        raise AppError("unauthenticated", "Invalid token.", 401)

    with _jwks_lock:
        _jwks_cache[url] = (now + _JWKS_TTL_SECONDS, body)
    return body


def _public_key_for_token(token: str, jwks: dict[str, Any]) -> Any:
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise AppError("unauthenticated", "Invalid token.", 401) from exc

    kid = header.get("kid")
    alg = header.get("alg")
    keys = jwks.get("keys") or []
    matching = [k for k in keys if (not kid or k.get("kid") == kid) and (not alg or k.get("alg") == alg)]
    if not matching and kid:
        matching = [k for k in keys if k.get("kid") == kid]
    if not matching:
        matching = list(keys)
    if not matching:
        raise AppError("unauthenticated", "Invalid token.", 401)

    jwk = matching[0]
    kty = jwk.get("kty")
    try:
        if kty == "EC":
            return ECAlgorithm.from_jwk(jwk)
        if kty == "RSA":
            return RSAAlgorithm.from_jwk(jwk)
        if kty == "OKP":
            return OKPAlgorithm.from_jwk(jwk)
    except (ValueError, TypeError, jwt.PyJWTError) as exc:
        raise AppError("unauthenticated", "Invalid token.", 401) from exc
    raise AppError("unauthenticated", "Invalid token.", 401)


def _decode_kwargs(settings: Settings) -> dict[str, Any]:
    options: dict[str, Any] = {"verify_aud": bool(settings.supabase_jwt_audience)}
    kwargs: dict[str, Any] = {"options": options}
    if settings.supabase_jwt_audience:
        kwargs["audience"] = settings.supabase_jwt_audience
    issuer = _issuer_for(settings)
    if issuer:
        kwargs["issuer"] = issuer
    return kwargs


def _subject_from_payload(payload: dict[str, Any]) -> str:
    sub = payload.get("sub")
    if not sub:
        raise AppError("unauthenticated", "Invalid token.", 401)
    return str(sub)


def decode_supabase_subject(settings: Settings, token: str) -> str:
    """Return the auth subject (`sub`) from a Supabase access token."""
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise AppError("unauthenticated", "Invalid token.", 401) from exc

    alg = str(header.get("alg") or "")
    jwks_url = _jwks_url(settings)
    decode_kwargs = _decode_kwargs(settings)

    # Asymmetric signing keys (ES256 / RS256 / EdDSA) via JWKS.
    if jwks_url and alg != "HS256":
        try:
            jwks = _fetch_jwks(jwks_url)
            key = _public_key_for_token(token, jwks)
            payload = jwt.decode(
                token,
                key=key,
                algorithms=["ES256", "RS256", "EdDSA"],
                **decode_kwargs,
            )
            return _subject_from_payload(payload)
        except AppError:
            raise
        except (httpx.HTTPError, jwt.PyJWTError, ValueError, TypeError) as exc:
            # Fall through to HS256 if configured (rotation / mixed projects).
            if not settings.supabase_jwt_secret:
                raise AppError("unauthenticated", "Invalid token.", 401) from exc

    if settings.supabase_jwt_secret:
        try:
            # Legacy shared-secret tokens — do not auto-inject issuer (older deploys omit it).
            options: dict[str, Any] = {"verify_aud": bool(settings.supabase_jwt_audience)}
            hs_kwargs: dict[str, Any] = {
                "algorithms": ["HS256"],
                "options": options,
            }
            if settings.supabase_jwt_audience:
                hs_kwargs["audience"] = settings.supabase_jwt_audience
            if settings.supabase_jwt_issuer:
                hs_kwargs["issuer"] = settings.supabase_jwt_issuer
            payload = jwt.decode(token, settings.supabase_jwt_secret, **hs_kwargs)
            return _subject_from_payload(payload)
        except jwt.PyJWTError as exc:
            raise AppError("unauthenticated", "Invalid token.", 401) from exc

    if settings.app_env == "production":
        raise AppError("unauthenticated", "Auth is not configured.", 401)

    from app.common.security import hash_token

    return f"dev:{hash_token(token, settings.guest_token_secret)[:24]}"


def clear_jwks_cache() -> None:
    with _jwks_lock:
        _jwks_cache.clear()
