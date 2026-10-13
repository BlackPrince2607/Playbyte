import json
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest

from app.infrastructure.storage.objects import LocalStorage
from app.modules.privacy import service as privacy
from app.modules.privacy.service import build_export_payload, complete_deletion, complete_export


class _FakeScalars:
    def __init__(self, items):
        self._items = items

    def __await__(self):
        async def _inner():
            return self

        return _inner().__await__()

    def __iter__(self):
        return iter(self._items)


class FakeSession:
    def __init__(self) -> None:
        self.user_id = uuid4()
        self.user = type(
            "U", (), {"status": "active", "created_at": datetime.now(UTC), "auth_subject": "auth-sub-1"}
        )()
        self.profile = type(
            "P",
            (),
            {"display_name": "Ada", "bio": "hi", "default_visibility": "friends"},
        )()
        self.data_request = type("DR", (), {"status": "queued", "completed_at": None, "download_key": None})()

    async def get(self, model, key):
        name = getattr(model, "__tablename__", "")
        if name == "users":
            return self.user
        if name == "profiles":
            return self.profile
        if name == "data_requests":
            return self.data_request
        return None

    async def scalars(self, _stmt):
        return _FakeScalars([])


@pytest.mark.asyncio
async def test_build_export_payload_shape() -> None:
    session = FakeSession()
    payload = await build_export_payload(session, session.user_id)
    assert payload["profile"]["displayName"] == "Ada"
    assert "responses" in payload
    assert "gamePlays" in payload


@pytest.mark.asyncio
async def test_complete_export_writes_file(tmp_path, monkeypatch) -> None:
    session = FakeSession()
    req_id = uuid4()
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(
        "app.infrastructure.storage.objects.get_object_storage",
        lambda: LocalStorage("http://localhost:8000"),
    )
    url = await complete_export(session, req_id, session.user_id)
    assert url.startswith("http://localhost:8000/static/exports/")
    key = f"exports/{session.user_id}/{req_id}.json"
    # Local storage flattens slashes in filename
    flat = tmp_path / "storage" / "exports" / key.replace("/", "_")
    data = json.loads(flat.read_text(encoding="utf-8"))
    assert data["profile"]["displayName"] == "Ada"
    assert session.data_request.status == "complete"


@pytest.mark.asyncio
async def test_complete_deletion_removes_avatar_file(monkeypatch) -> None:
    session = FakeSession()
    key = f"users/{session.user_id}/face.png"
    session.profile.avatar_key = key
    session.execute = AsyncMock()
    deleted: list[tuple[str, str]] = []

    class Storage:
        async def delete_object(self, bucket: str, object_key: str) -> None:
            deleted.append((bucket, object_key))

    monkeypatch.setattr("app.infrastructure.storage.objects.get_object_storage", lambda: Storage())
    removed_logins: list[str | None] = []

    async def fake_delete_auth_user(subject: str | None) -> None:
        removed_logins.append(subject)

    monkeypatch.setattr(privacy, "delete_auth_user", fake_delete_auth_user)
    await complete_deletion(session, session.user_id, uuid4())

    assert ("avatars", key) in deleted
    assert session.profile.avatar_key is None
    assert session.profile.display_name == "Deleted user"
    assert session.user.status == "deleted"
    assert removed_logins == ["auth-sub-1"]


@pytest.mark.asyncio
async def test_delete_auth_user_calls_supabase_admin(monkeypatch) -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json={})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(privacy.httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(
        privacy,
        "get_settings",
        lambda: SimpleNamespace(supabase_url="https://x.supabase.co/", supabase_service_role_key="sb_secret_k"),
    )

    await privacy.delete_auth_user("auth-sub-1")
    await privacy.delete_auth_user("deleted:abc")

    assert len(calls) == 1
    assert calls[0].method == "DELETE"
    assert str(calls[0].url) == "https://x.supabase.co/auth/v1/admin/users/auth-sub-1"
    assert calls[0].headers["apikey"] == "sb_secret_k"


@pytest.mark.asyncio
async def test_export_download_url_prefers_signed_links(monkeypatch) -> None:
    class Signed:
        async def create_signed_url(self, bucket: str, key: str, *, expires_in: int) -> str:
            return f"https://signed/{bucket}/{key}?ttl={expires_in}"

    monkeypatch.setattr("app.infrastructure.storage.objects.get_object_storage", lambda: Signed())
    assert await privacy.export_download_url("exports/u/r.json") == "https://signed/exports/exports/u/r.json?ttl=3600"

    monkeypatch.setattr(
        "app.infrastructure.storage.objects.get_object_storage", lambda: LocalStorage("http://localhost:8000")
    )
    assert await privacy.export_download_url("exports/u/r.json") == (
        "http://localhost:8000/static/exports/exports_u_r.json"
    )


@pytest.mark.asyncio
async def test_export_download_url_storage_failure_is_none(monkeypatch) -> None:
    def broken():
        raise RuntimeError("no storage")

    monkeypatch.setattr("app.infrastructure.storage.objects.get_object_storage", broken)
    assert await privacy.export_download_url("exports/u/r.json") is None


@pytest.mark.asyncio
async def test_delete_auth_user_without_supabase_config_is_noop() -> None:
    await privacy.delete_auth_user("auth-sub-1")
