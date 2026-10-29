from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    app_env: str = "development"
    log_level: str = "INFO"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_public_url: str = "http://localhost:8000"
    cors_origins: str = "http://localhost:3000,http://localhost:8081"

    database_url: str = "postgresql+asyncpg://maja:maja@localhost:5432/maja"

    guest_token_secret: str = "change-me-guest-token-secret"
    guest_session_ttl_hours: int = 720
    account_prompt_after: int = 3

    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""
    supabase_storage_bucket_avatars: str = "avatars"
    supabase_storage_bucket_shares: str = "share-cards"
    supabase_storage_bucket_exports: str = "exports"
    supabase_storage_bucket_moment_media: str = "moment-media"
    supabase_jwt_audience: str = "authenticated"
    supabase_jwt_issuer: str = ""

    admin_api_key: str = "dev-admin-key"

    # Invite links: /add/{code} opens the app through Android App Links, verified against these
    # signing-certificate fingerprints (comma-separated; add Play's app-signing key when publishing).
    android_package: str = "app.maja.mobile"
    android_cert_sha256: str = (
        "57:CA:F6:15:82:38:8C:A9:8F:01:D4:BA:76:E0:79:A3:58:88:D2:6B:DD:B1:90:79:6E:1E:62:F9:35:11:75:26"
    )
    app_download_url: str = ""

    sentry_dsn: str = ""
    # RevenueCat secret API key (server only). Empty disables coin pack verification.
    revenuecat_secret_api_key: str = ""
    # Full Authorization header value configured on the RevenueCat webhook.
    revenuecat_webhook_authorization: str = ""
    rate_limit_response_per_minute: int = 60
    rate_limit_guest_create_per_hour: int = 30
    rate_limit_event_batches_per_minute: int = 30
    rate_limit_social_per_minute: int = 60
    rate_limit_comments_per_minute: int = 6

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def async_database_url(self) -> str:
        url = self.database_url
        if url.startswith("postgresql://") and "+asyncpg" not in url:
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
