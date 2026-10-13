from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.common.errors import AppError
from app.modules.avatars import service
from app.modules.avatars.service import (
    owns_avatar_key,
    remove_avatar,
    sniff_image_type,
    store_avatar,
)

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 16


class FakeStorage:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.put: list[tuple[str, str, str]] = []
        self.deleted: list[tuple[str, str]] = []

    async def put_bytes(self, bucket: str, key: str, data: bytes, content_type: str) -> str:
        if self.fail:
            raise RuntimeError("Storage upload failed (500)")
        self.put.append((bucket, key, content_type))
        return f"https://cdn.example/{bucket}/{key}"

    async def delete_object(self, bucket: str, key: str) -> None:
        self.deleted.append((bucket, key))


def session_with(profile):
    session = AsyncMock()
    session.get = AsyncMock(return_value=profile)
    session.add = MagicMock()
    return session


@pytest.fixture
def storage(monkeypatch) -> FakeStorage:
    fake = FakeStorage()
    monkeypatch.setattr(service, "get_object_storage", lambda: fake)
    return fake


@pytest.mark.parametrize(("data", "expected"), [(PNG, "image/png"), (JPEG, "image/jpeg"), (WEBP, "image/webp")])
def test_sniff_known_types(data: bytes, expected: str) -> None:
    assert sniff_image_type(data) == expected


def test_sniff_rejects_other_bytes() -> None:
    assert sniff_image_type(b"<svg xmlns='http://www.w3.org/2000/svg'/>") is None
    assert sniff_image_type(b"") is None


def test_owns_avatar_key() -> None:
    me = uuid4()
    assert owns_avatar_key(me, f"users/{me}/a.png")
    assert not owns_avatar_key(me, f"users/{uuid4()}/a.png")
    assert not owns_avatar_key(me, f"users/{me}/../other/a.png")
    assert not owns_avatar_key(me, None)


@pytest.mark.asyncio
async def test_store_avatar_uploads_and_replaces_previous(storage: FakeStorage) -> None:
    me = uuid4()
    old = f"users/{me}/old.png"
    profile = SimpleNamespace(avatar_key=old)

    out = await store_avatar(session_with(profile), me, JPEG, "image/jpeg")

    assert out["avatarKey"].startswith(f"users/{me}/") and out["avatarKey"].endswith(".jpg")
    assert profile.avatar_key == out["avatarKey"]
    assert storage.put == [("avatars", out["avatarKey"], "image/jpeg")]
    assert storage.deleted == [("avatars", old)]


@pytest.mark.asyncio
async def test_store_avatar_creates_missing_profile(storage: FakeStorage) -> None:
    session = session_with(None)
    out = await store_avatar(session, uuid4(), PNG, "image/png")
    created = session.add.call_args.args[0]
    assert created.avatar_key == out["avatarKey"]


@pytest.mark.asyncio
async def test_store_avatar_never_deletes_someone_elses_file(storage: FakeStorage) -> None:
    profile = SimpleNamespace(avatar_key="presets/robot.png")
    await store_avatar(session_with(profile), uuid4(), PNG, "image/png")
    assert storage.deleted == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("data", "content_type"),
    [(PNG, "image/jpeg"), (b"GIF89a" + b"\x00" * 10, "image/gif"), (b"", "image/png")],
)
async def test_store_avatar_rejects_mismatched_or_unknown(storage: FakeStorage, data: bytes, content_type: str) -> None:
    with pytest.raises(AppError) as exc:
        await store_avatar(session_with(SimpleNamespace(avatar_key=None)), uuid4(), data, content_type)
    assert exc.value.status_code == 422
    assert storage.put == []


@pytest.mark.asyncio
async def test_store_avatar_rejects_oversized(storage: FakeStorage) -> None:
    big = PNG + b"\x00" * service.MAX_AVATAR_BYTES
    with pytest.raises(AppError) as exc:
        await store_avatar(session_with(SimpleNamespace(avatar_key=None)), uuid4(), big, "image/png")
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_store_avatar_storage_failure_is_503(monkeypatch) -> None:
    monkeypatch.setattr(service, "get_object_storage", lambda: FakeStorage(fail=True))
    profile = SimpleNamespace(avatar_key=None)
    with pytest.raises(AppError) as exc:
        await store_avatar(session_with(profile), uuid4(), PNG, "image/png")
    assert exc.value.status_code == 503
    assert profile.avatar_key is None


@pytest.mark.asyncio
async def test_remove_avatar_clears_and_deletes(storage: FakeStorage) -> None:
    me = uuid4()
    key = f"users/{me}/a.webp"
    profile = SimpleNamespace(avatar_key=key)
    await remove_avatar(session_with(profile), me)
    assert profile.avatar_key is None
    assert storage.deleted == [("avatars", key)]


@pytest.mark.asyncio
async def test_remove_avatar_without_one_is_noop(storage: FakeStorage) -> None:
    await remove_avatar(session_with(SimpleNamespace(avatar_key=None)), uuid4())
    assert storage.deleted == []
