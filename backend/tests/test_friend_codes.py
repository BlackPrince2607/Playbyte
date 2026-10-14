"""Friend codes and the public invite page."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.infrastructure.postgres.db import get_session
from app.main import create_app
from app.modules.friends.codes import code_range, format_code, friend_code, parse_code

# Shared with apps/mobile/src/lib/friendCode.test.ts so both sides agree.
VECTOR_ID = UUID("3f2a9c1b-0d4e-4b7a-9c2d-81e5f6a7b8c9")
VECTOR_CODE = "7WN9R6RD"


def test_friend_code_matches_shared_vector() -> None:
    assert friend_code(VECTOR_ID) == VECTOR_CODE
    assert friend_code(UUID(int=0)) == "00000000"
    assert friend_code(UUID("ffffffff-ffff-ffff-ffff-ffffffffffff")) == "ZZZZZZZZ"
    assert format_code(VECTOR_CODE) == "7WN9-R6RD"


def test_code_range_contains_its_owner() -> None:
    for _ in range(50):
        uid = uuid4()
        lo, hi = code_range(friend_code(uid))
        assert lo <= uid <= hi


@pytest.mark.parametrize(
    "text",
    [
        "7WN9R6RD",
        "7wn9-r6rd",
        " 7WN9 R6RD ",
        "https://majaa-production.up.railway.app/add/7WN9-R6RD",
        "Add me on MAJA: https://example.app/add/7wn9r6rd?ref=share",
    ],
)
def test_parse_code_accepts_codes_and_links(text: str) -> None:
    assert parse_code(text) == VECTOR_CODE


def test_parse_code_fixes_lookalike_letters() -> None:
    assert parse_code("o0il-abcd") == "0011ABCD"


@pytest.mark.parametrize("text", ["", "7WN9R6R", "7WN9R6RDX", "7WN9-R6RU", "hello there"])
def test_parse_code_rejects_bad_input(text: str) -> None:
    assert parse_code(text) is None


@pytest.fixture
def client():
    app = create_app()
    session = AsyncMock()
    app.dependency_overrides[get_session] = lambda: session
    try:
        yield TestClient(app), session
    finally:
        app.dependency_overrides.clear()


def test_assetlinks_lists_the_app(client) -> None:
    http, _ = client
    body = http.get("/.well-known/assetlinks.json").json()
    target = body[0]["target"]
    assert target["package_name"] == "app.maja.mobile"
    assert len(target["sha256_cert_fingerprints"]) == 1


def test_invite_page_names_the_inviter(client) -> None:
    http, session = client
    session.scalars = AsyncMock(return_value=MagicMock(all=lambda: [SimpleNamespace(id=VECTOR_ID)]))
    session.get = AsyncMock(
        return_value=SimpleNamespace(display_name="Ada <3", default_visibility="friends")
    )
    res = http.get("/add/7wn9-r6rd")
    assert res.status_code == 200
    assert "Ada &lt;3 invited you to MAJA" in res.text
    assert "intent://add/7WN9R6RD#Intent;scheme=maja;package=app.maja.mobile;" in res.text
    assert "7WN9-R6RD" in res.text


def test_invite_page_hides_private_names(client) -> None:
    http, session = client
    session.scalars = AsyncMock(return_value=MagicMock(all=lambda: [SimpleNamespace(id=VECTOR_ID)]))
    session.get = AsyncMock(
        return_value=SimpleNamespace(display_name="Secret", default_visibility="private")
    )
    res = http.get("/add/7WN9R6RD")
    assert "You&#x27;re invited to MAJA" in res.text
    assert "Secret" not in res.text


def test_invite_page_rejects_bad_codes(client) -> None:
    http, _ = client
    res = http.get("/add/nope")
    assert res.status_code == 404
    assert "isn&#x27;t valid" in res.text
