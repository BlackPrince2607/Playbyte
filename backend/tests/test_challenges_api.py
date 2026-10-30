"""HTTP smoke tests for /v1/challenges and /v1/me/challenges."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.common.auth import Actor, require_user
from app.infrastructure.postgres.db import get_session
from app.main import create_app


@pytest.fixture
def user_client():
    app = create_app()
    session = AsyncMock()
    user_id = uuid4()
    actor = Actor(kind="user", user_id=user_id)
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[require_user] = lambda: actor
    try:
        yield TestClient(app), session, user_id
    finally:
        app.dependency_overrides.clear()


def test_create_requires_idempotency_key(user_client) -> None:
    http, _session, _uid = user_client
    res = http.post(
        "/v1/challenges",
        json={"opponentUserId": str(uuid4()), "gameKey": "guess_flag"},
    )
    assert res.status_code == 400
    assert res.json()["code"] == "idempotency_required"


def test_create_challenge_ok(user_client) -> None:
    http, _session, uid = user_client
    now = datetime.now(UTC)
    row = SimpleNamespace(
        id=uuid4(),
        status="pending",
        seed="seed-1",
        created_at=now,
        expires_at=now + timedelta(days=7),
    )
    with patch("app.api.v1.challenges.create_challenge", AsyncMock(return_value=row)) as create:
        res = http.post(
            "/v1/challenges",
            headers={"Idempotency-Key": "idem-1"},
            json={"opponentUserId": str(uuid4()), "gameKey": "guess_flag", "seed": "seed-1"},
        )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["id"] == str(row.id)
    assert body["status"] == "pending"
    assert body["seed"] == "seed-1"
    create.assert_awaited_once()
    assert create.await_args.args[1] == uid


def test_accept_decline_get(user_client) -> None:
    http, _session, uid = user_client
    cid = uuid4()
    row = SimpleNamespace(
        id=cid,
        status="active",
        seed="s",
        game_key="guess_flag",
        challenger_id=uuid4(),
        opponent_id=uid,
        expires_at=datetime.now(UTC) + timedelta(days=1),
        created_at=datetime.now(UTC),
        challenger_play_id=None,
        opponent_play_id=None,
        moment_id=None,
    )
    with (
        patch("app.api.v1.challenges.accept_challenge", AsyncMock(return_value=row)),
        patch("app.api.v1.challenges.decline_challenge", AsyncMock(return_value=SimpleNamespace(status="declined"))),
        patch("app.api.v1.challenges.get_challenge", AsyncMock(return_value=row)),
        patch(
            "app.api.v1.challenges.serialize_challenge",
            AsyncMock(return_value={"id": str(cid), "status": "active", "role": "opponent"}),
        ),
    ):
        assert http.post(f"/v1/challenges/{cid}/accept").json()["status"] == "active"
        assert http.post(f"/v1/challenges/{cid}/decline").json()["status"] == "declined"
        got = http.get(f"/v1/challenges/{cid}")
        assert got.status_code == 200
        assert got.json()["role"] == "opponent"


def test_list_my_challenges(user_client) -> None:
    http, _session, _uid = user_client
    with (
        patch("app.api.v1.me.list_challenges", AsyncMock(return_value=[])),
    ):
        res = http.get("/v1/me/challenges")
    assert res.status_code == 200
    assert res.json() == {"challenges": []}


def test_guest_cannot_challenge() -> None:
    from app.common.auth import get_actor

    app = create_app()
    session = AsyncMock()
    guest = Actor(kind="guest", guest_id=uuid4())
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_actor] = lambda: guest
    client = TestClient(app)
    try:
        res = client.post(
            "/v1/challenges",
            headers={"Idempotency-Key": "x"},
            json={"opponentUserId": str(uuid4()), "gameKey": "guess_flag"},
        )
        assert res.status_code == 401
        assert res.json()["code"] == "user_required"
    finally:
        app.dependency_overrides.clear()
