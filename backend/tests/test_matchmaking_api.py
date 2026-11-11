"""HTTP smoke tests for /v1/matchmaking and /v1/matches."""

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
    res = http.post("/v1/matchmaking/tickets", json={"gameKey": "guess_flag"})
    assert res.status_code == 400
    assert res.json()["code"] == "idempotency_required"


def test_create_ticket_ok(user_client) -> None:
    http, _session, uid = user_client
    ticket = SimpleNamespace(id=uuid4(), status="searching")
    with (
        patch("app.api.v1.matchmaking.mm.enqueue_ticket", AsyncMock(return_value=ticket)) as create,
        patch(
            "app.api.v1.matchmaking.mm.serialize_ticket",
            AsyncMock(return_value={"id": str(ticket.id), "status": "searching"}),
        ),
    ):
        res = http.post(
            "/v1/matchmaking/tickets",
            headers={"Idempotency-Key": "idem-mm-1"},
            json={"gameKey": "guess_flag"},
        )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "searching"
    create.assert_awaited_once()
    assert create.await_args.args[1] == uid


def test_get_match_ok(user_client) -> None:
    http, _session, _uid = user_client
    mid = uuid4()
    row = SimpleNamespace(id=mid)
    with (
        patch("app.api.v1.matches.mm.get_match", AsyncMock(return_value=row)),
        patch(
            "app.api.v1.matches.mm.serialize_match",
            AsyncMock(return_value={"id": str(mid), "status": "ready", "seed": "abc"}),
        ),
    ):
        res = http.get(f"/v1/matches/{mid}")
    assert res.status_code == 200
    assert res.json()["seed"] == "abc"


def test_list_my_matches(user_client) -> None:
    http, _session, _uid = user_client
    with (
        patch("app.api.v1.me.matchmaking.list_matches", AsyncMock(return_value=[])),
    ):
        res = http.get("/v1/me/matches")
    assert res.status_code == 200
    assert res.json() == {"matches": []}
