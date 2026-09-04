from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

from app.config import Settings, get_settings


class ObjectStorage(ABC):
    @abstractmethod
    async def put_bytes(self, bucket: str, key: str, data: bytes, content_type: str) -> str:
        raise NotImplementedError

    @abstractmethod
    async def delete_object(self, bucket: str, key: str) -> None:
        raise NotImplementedError

    def public_url(self, bucket: str, key: str) -> str:
        raise NotImplementedError


class LocalStorage(ObjectStorage):
    """Development-only filesystem storage. Not used when Supabase is configured in production."""

    def __init__(self, public_url: str) -> None:
        self._public_url = public_url.rstrip("/")

    async def put_bytes(self, bucket: str, key: str, data: bytes, content_type: str) -> str:
        from app.infrastructure.storage.validation import validate_upload

        validate_upload(bucket=bucket, key=key, content_type=content_type, size=len(data))
        root = Path("storage") / bucket
        root.mkdir(parents=True, exist_ok=True)
        path = root / key.replace("/", "_")
        path.write_bytes(data)
        return f"{self._public_url}/static/{bucket}/{path.name}"

    async def delete_object(self, bucket: str, key: str) -> None:
        path = Path("storage") / bucket / key.replace("/", "_")
        if path.exists():
            path.unlink()

    def public_url(self, bucket: str, key: str) -> str:
        return f"{self._public_url}/static/{bucket}/{key.replace('/', '_')}"


def get_object_storage(settings: Settings | None = None) -> ObjectStorage:
    settings = settings or get_settings()
    if settings.supabase_url and settings.supabase_service_role_key:
        from app.infrastructure.storage.supabase import SupabaseStorage

        return SupabaseStorage(
            supabase_url=settings.supabase_url,
            service_role_key=settings.supabase_service_role_key,
            bucket_shares=settings.supabase_storage_bucket_shares,
            bucket_avatars=settings.supabase_storage_bucket_avatars,
            bucket_exports=settings.supabase_storage_bucket_exports,
        )
    if settings.app_env == "production":
        raise RuntimeError("Supabase Storage credentials are required in production.")
    return LocalStorage(settings.api_public_url)
