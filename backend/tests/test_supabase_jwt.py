"""Tests for Supabase JWT verification (HS256 + JWKS ES256)."""

from __future__ import annotations

import json
import time
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from jwt.algorithms import ECAlgorithm

from app.common.errors import AppError
from app.common.supabase_jwt import clear_jwks_cache, decode_supabase_subject
from app.config import Settings


def _settings(**kwargs: Any) -> Settings:
    base = {
        "app_env": "production",
        "supabase_url": "https://example.supabase.co",
        "supabase_jwt_audience": "authenticated",
        "supabase_jwt_issuer": "https://example.supabase.co/auth/v1",
        "supabase_jwt_secret": "",
    }
    base.update(kwargs)
    return Settings(**base)


def test_hs256_legacy_secret() -> None:
    secret = "test-jwt-secret-value"
    token = jwt.encode(
        {
            "sub": "user-hs256",
            "aud": "authenticated",
            "role": "authenticated",
            "exp": int(time.time()) + 3600,
        },
        secret,
        algorithm="HS256",
    )
    settings = _settings(supabase_jwt_secret=secret, supabase_url="", supabase_jwt_issuer="")
    assert decode_supabase_subject(settings, token) == "user-hs256"


def test_es256_via_jwks(monkeypatch: pytest.MonkeyPatch) -> None:
    clear_jwks_cache()
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_jwk = json.loads(ECAlgorithm.to_jwk(private_key.public_key()))
    public_jwk.update({"kid": "test-kid", "alg": "ES256", "use": "sig"})

    token = jwt.encode(
        {
            "sub": "user-es256",
            "aud": "authenticated",
            "role": "authenticated",
            "iss": "https://example.supabase.co/auth/v1",
            "exp": int(time.time()) + 3600,
        },
        private_key,
        algorithm="ES256",
        headers={"kid": "test-kid"},
    )

    def fake_fetch(_url: str) -> dict[str, Any]:
        return {"keys": [public_jwk]}

    monkeypatch.setattr("app.common.supabase_jwt._fetch_jwks", fake_fetch)
    settings = _settings(supabase_jwt_secret="")
    assert decode_supabase_subject(settings, token) == "user-es256"


def test_rejects_tampered_es256(monkeypatch: pytest.MonkeyPatch) -> None:
    clear_jwks_cache()
    private_key = ec.generate_private_key(ec.SECP256R1())
    other_key = ec.generate_private_key(ec.SECP256R1())
    public_jwk = json.loads(ECAlgorithm.to_jwk(other_key.public_key()))
    public_jwk.update({"kid": "test-kid", "alg": "ES256", "use": "sig"})

    token = jwt.encode(
        {
            "sub": "user-es256",
            "aud": "authenticated",
            "iss": "https://example.supabase.co/auth/v1",
            "exp": int(time.time()) + 3600,
        },
        private_key,
        algorithm="ES256",
        headers={"kid": "test-kid"},
    )

    monkeypatch.setattr("app.common.supabase_jwt._fetch_jwks", lambda _url: {"keys": [public_jwk]})
    settings = _settings(supabase_jwt_secret="")
    with pytest.raises(AppError) as exc:
        decode_supabase_subject(settings, token)
    assert exc.value.status_code == 401
