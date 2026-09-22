"""Tests for admin moment-media upload helpers."""

from __future__ import annotations

import base64
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.v1.admin import _normalize_media_key
from app.common.admin import require_admin
from app.common.auth import Actor
from app.common.errors import AppError
from app.main import create_app


def test_normalize_media_key_rejects_traversal() -> None:
    with pytest.raises(AppError):
        _normalize_media_key("../evil.png", "image/png")


def test_normalize_media_key_auto_generates() -> None:
    key = _normalize_media_key(None, "image/jpeg")
    assert key.startswith("prompts/")
    assert key.endswith(".jpg")


def test_admin_media_json_upload() -> None:
    app = create_app()
    app.dependency_overrides[require_admin] = lambda: Actor(kind="user", is_admin=True)
    client = TestClient(app)

    storage = MagicMock()
    storage.put_bytes = AsyncMock(return_value="http://localhost/static/moment-media/x.png")

    try:
        with patch("app.api.v1.admin.get_object_storage", return_value=storage):
            res = client.post(
                "/v1/admin/media",
                json={
                    "contentType": "image/png",
                    "base64": base64.b64encode(b"fake-png").decode(),
                    "key": "prompts/test.png",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["key"] == "prompts/test.png"
    assert "url" in body
    storage.put_bytes.assert_awaited_once()
