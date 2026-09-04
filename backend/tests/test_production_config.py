
from app.common.security import validate_production_settings
from app.config import Settings


def test_production_requires_supabase_storage_credentials() -> None:
    settings = Settings(
        app_env="production",
        admin_api_key="x" * 40,
        guest_token_secret="y" * 40,
        supabase_jwt_secret="jwt-secret",
        supabase_url="",
        supabase_service_role_key="",
        database_url="postgresql+asyncpg://user:pass@db.supabase.co:5432/postgres",
        api_public_url="https://api.playbyte.app",
        cors_origins="https://admin.playbyte.app",
    )
    errors = validate_production_settings(settings)
    assert any("SUPABASE_URL" in e for e in errors)
    assert any("SUPABASE_SERVICE_ROLE_KEY" in e for e in errors)


def test_production_requires_https_api_url() -> None:
    settings = Settings(
        app_env="production",
        admin_api_key="x" * 40,
        guest_token_secret="y" * 40,
        supabase_jwt_secret="jwt-secret",
        supabase_url="https://x.supabase.co",
        supabase_service_role_key="service",
        database_url="postgresql+asyncpg://user:pass@db.supabase.co:5432/postgres",
        api_public_url="http://api.playbyte.app",
        cors_origins="https://admin.playbyte.app",
    )
    errors = validate_production_settings(settings)
    assert any("HTTPS" in e for e in errors)
