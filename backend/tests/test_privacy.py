import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.infrastructure.storage.objects import LocalStorage
from app.modules.privacy.service import build_export_payload, complete_export


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
        self.user = type("U", (), {"status": "active", "created_at": datetime.now(UTC)})()
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
    path = tmp_path / "storage" / "exports" / f"{session.user_id}_{req_id}.json"
    # Local storage flattens slashes in filename
    flat = tmp_path / "storage" / "exports" / key.replace("/", "_")
    data = json.loads(flat.read_text(encoding="utf-8"))
    assert data["profile"]["displayName"] == "Ada"
    assert session.data_request.status == "complete"
