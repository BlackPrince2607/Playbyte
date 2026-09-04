from __future__ import annotations

import httpx

from app.infrastructure.storage.objects import ObjectStorage
from app.infrastructure.storage.validation import StorageValidationError, validate_upload


class SupabaseStorage(ObjectStorage):
    """Server-side Supabase Storage client (service role only)."""

    def __init__(
        self,
        *,
        supabase_url: str,
        service_role_key: str,
        bucket_shares: str = "share-cards",
        bucket_avatars: str = "avatars",
        bucket_exports: str = "exports",
    ) -> None:
        self._base = supabase_url.rstrip("/")
        self._key = service_role_key
        self._buckets = {
            "share-cards": bucket_shares,
            "avatars": bucket_avatars,
            "exports": bucket_exports,
        }

    def _bucket_name(self, bucket: str) -> str:
        return self._buckets.get(bucket, bucket)

    def _headers(self, content_type: str, *, upsert: bool = True) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self._key}",
            "Content-Type": content_type,
        }
        if upsert:
            headers["x-upsert"] = "true"
        return headers

    async def put_bytes(self, bucket: str, key: str, data: bytes, content_type: str) -> str:
        validate_upload(bucket=bucket, key=key, content_type=content_type, size=len(data))
        bucket_name = self._bucket_name(bucket)
        url = f"{self._base}/storage/v1/object/{bucket_name}/{key}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(url, content=data, headers=self._headers(content_type))
            if res.status_code >= 400:
                raise RuntimeError(f"Storage upload failed ({res.status_code})")
        if bucket == "exports":
            return await self.create_signed_url(bucket, key, expires_in=86400)
        return self.public_url(bucket, key)

    async def delete_object(self, bucket: str, key: str) -> None:
        bucket_name = self._bucket_name(bucket)
        url = f"{self._base}/storage/v1/object/{bucket_name}/{key}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.delete(url, headers={"Authorization": f"Bearer {self._key}"})
            if res.status_code not in (200, 204, 404):
                raise RuntimeError(f"Storage delete failed ({res.status_code})")

    def public_url(self, bucket: str, key: str) -> str:
        bucket_name = self._bucket_name(bucket)
        return f"{self._base}/storage/v1/object/public/{bucket_name}/{key}"

    async def create_signed_url(self, bucket: str, key: str, *, expires_in: int = 3600) -> str:
        bucket_name = self._bucket_name(bucket)
        url = f"{self._base}/storage/v1/object/sign/{bucket_name}/{key}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                url,
                json={"expiresIn": expires_in},
                headers={"Authorization": f"Bearer {self._key}", "Content-Type": "application/json"},
            )
            if res.status_code >= 400:
                raise RuntimeError(f"Storage sign failed ({res.status_code})")
            payload = res.json()
            signed = payload.get("signedURL") or payload.get("signedUrl")
            if not signed:
                raise RuntimeError("Storage sign response missing URL")
            if signed.startswith("http"):
                return signed
            return f"{self._base}{signed}"


__all__ = ["SupabaseStorage", "StorageValidationError"]
