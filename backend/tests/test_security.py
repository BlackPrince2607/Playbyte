from app.common.security import (
    DEFAULT_ADMIN_KEY,
    DEFAULT_GUEST_SECRET,
    hash_token,
    validate_production_settings,
)
from app.config import Settings


def test_hash_token_uses_secret() -> None:
    a = hash_token("gst_test", "secret-one")
    b = hash_token("gst_test", "secret-two")
    assert a != b
    assert hash_token("gst_test", "secret-one") == a


def test_production_validation_rejects_defaults() -> None:
    settings = Settings(
        app_env="production",
        admin_api_key=DEFAULT_ADMIN_KEY,
        guest_token_secret=DEFAULT_GUEST_SECRET,
        supabase_jwt_secret="",
        database_url="postgresql+asyncpg://playbyte:playbyte@localhost:5432/playbyte",
    )
    errors = validate_production_settings(settings)
    assert any("ADMIN_API_KEY" in e for e in errors)
    assert any("GUEST_TOKEN_SECRET" in e for e in errors)
    assert any("SUPABASE_JWT_SECRET" in e for e in errors)
    assert any("localhost" in e for e in errors)


def test_production_validation_accepts_strong_config() -> None:
    settings = Settings(
        app_env="production",
        admin_api_key="x" * 40,
        guest_token_secret="y" * 40,
        supabase_jwt_secret="jwt-secret",
        supabase_url="https://xxx.supabase.co",
        supabase_service_role_key="service-role-key",
        database_url="postgresql+asyncpg://user:pass@db.supabase.co:5432/postgres",
        api_public_url="https://api.playbyte.app",
        cors_origins="https://admin.playbyte.app",
    )
    assert validate_production_settings(settings) == []
