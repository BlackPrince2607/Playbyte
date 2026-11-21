"""Category queue helpers for online Quick Match."""

from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.modules.matchmaking import categories as cats
from app.modules.matchmaking import service as mm


def test_known_categories_cover_client_lobbies():
    expected = {"mixed", "trivia", "emoji", "movies", "music", "arcade", "puzzle", "brain"}
    assert set(cats.CATEGORY_POOLS) == expected
    assert cats.is_known_category("trivia")
    assert not cats.is_known_category("nope")
    assert cats.pool_for("music") == ("emoji_song",)
    assert cats.pool_for("mixed") == ()


def test_queue_bucket_prefers_concrete_game_then_category():
    assert mm._queue_bucket(SimpleNamespace(game_key="guess_flag", category="trivia")) == "game:guess_flag"
    assert mm._queue_bucket(SimpleNamespace(game_key=None, category="emoji")) == "cat:emoji"
    assert mm._queue_bucket(SimpleNamespace(game_key=None, category=None)) == "cat:mixed"


@pytest.mark.asyncio
async def test_resolve_game_key_rotates_category_pool(monkeypatch):
    ticket = SimpleNamespace(id=uuid4(), game_key=None, category="music")
    enabled = ["emoji_song"]

    async def fake_enabled(_session, keys=None):
        assert keys == ["emoji_song"]
        return enabled

    monkeypatch.setattr(mm, "_enabled_game_keys", fake_enabled)
    picked = await mm._resolve_game_key(None, ticket)  # type: ignore[arg-type]
    assert picked == "emoji_song"


@pytest.mark.asyncio
async def test_resolve_game_key_concrete_wins():
    ticket = SimpleNamespace(game_key="lane_dash", category="arcade")
    assert await mm._resolve_game_key(None, ticket) == "lane_dash"  # type: ignore[arg-type]
