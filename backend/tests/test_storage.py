
import pytest

from app.infrastructure.storage.objects import LocalStorage
from app.infrastructure.storage.validation import StorageValidationError, validate_upload


def test_validate_upload_rejects_bad_content_type() -> None:
    with pytest.raises(StorageValidationError):
        validate_upload(bucket="share-cards", key="share/a.png", content_type="text/plain", size=100)


def test_validate_upload_rejects_oversized() -> None:
    with pytest.raises(StorageValidationError):
        validate_upload(bucket="share-cards", key="share/a.png", content_type="image/png", size=3_000_000)


def test_validate_upload_accepts_png() -> None:
    validate_upload(bucket="share-cards", key="share/moment/x.png", content_type="image/png", size=1024)


@pytest.mark.asyncio
async def test_local_storage_put_and_delete(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    storage = LocalStorage("http://localhost:8000")
    url = await storage.put_bytes("share-cards", "share/test.png", b"png-bytes", "image/png")
    assert url.endswith("test.png")
    await storage.delete_object("share-cards", "share/test.png")
    assert not (tmp_path / "storage" / "share-cards" / "share_test.png").exists()


@pytest.mark.asyncio
async def test_supabase_storage_upload(monkeypatch) -> None:
    from app.infrastructure.storage.supabase import SupabaseStorage

    class FakeResponse:
        status_code = 200

        def json(self):
            return {}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, content, headers):
            assert "Authorization" in headers
            assert url.endswith("/storage/v1/object/share-cards/share/x.png")
            return FakeResponse()

    monkeypatch.setattr("app.infrastructure.storage.supabase.httpx.AsyncClient", lambda **_: FakeClient())
    storage = SupabaseStorage(
        supabase_url="https://example.supabase.co",
        service_role_key="service-key",
    )
    public = await storage.put_bytes("share-cards", "share/x.png", b"x", "image/png")
    assert public == "https://example.supabase.co/storage/v1/object/public/share-cards/share/x.png"
