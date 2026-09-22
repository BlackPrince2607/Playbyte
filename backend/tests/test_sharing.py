"""Share-card service behavior."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.common.auth import Actor
from app.common.errors import AppError
from app.modules.sharing.service import _render, moment_share_card


def test_render_share_card_png() -> None:
    png = _render("Who wins tonight?", "Home side")
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    assert len(png) > 1000


@pytest.mark.asyncio
async def test_share_card_requires_prior_response() -> None:
    moment_id = uuid4()
    actor = Actor(kind="guest", guest_id=uuid4())
    session = AsyncMock()
    session.scalar = AsyncMock(side_effect=[None, None])  # no existing card, no response
    session.get = AsyncMock(return_value=SimpleNamespace(prompt="Q?"))

    with patch("app.modules.sharing.service.get_object_storage", return_value=MagicMock()):
        with pytest.raises(AppError) as exc:
            await moment_share_card(session, actor, moment_id)
    assert exc.value.status_code == 403
    assert exc.value.code == "forbidden"


@pytest.mark.asyncio
async def test_share_card_not_found_invalid_moment() -> None:
    moment_id = uuid4()
    actor = Actor(kind="guest", guest_id=uuid4())
    session = AsyncMock()
    session.scalar = AsyncMock(return_value=None)  # no existing card
    session.get = AsyncMock(return_value=None)  # moment missing

    with patch("app.modules.sharing.service.get_object_storage", return_value=MagicMock()):
        with pytest.raises(AppError) as exc:
            await moment_share_card(session, actor, moment_id)
    assert exc.value.status_code == 404
    assert exc.value.code == "not_found"


@pytest.mark.asyncio
async def test_share_card_success_generates_and_uploads() -> None:
    moment_id = uuid4()
    option_id = uuid4()
    guest_id = uuid4()
    actor = Actor(kind="guest", guest_id=guest_id)
    response = SimpleNamespace(option_id=option_id)
    option = SimpleNamespace(label="Chai")
    moment = SimpleNamespace(prompt="Chai or coffee?")

    session = AsyncMock()
    session.scalar = AsyncMock(side_effect=[None, response])
    session.get = AsyncMock(side_effect=[moment, option])
    session.add = MagicMock()

    storage = MagicMock()
    storage.put_bytes = AsyncMock(return_value="https://cdn.example/share-cards/x.png")
    storage.public_url = MagicMock(return_value="https://cdn.example/share-cards/x.png")

    with patch("app.modules.sharing.service.get_object_storage", return_value=storage):
        out = await moment_share_card(session, actor, moment_id)

    assert out["assetUrl"] == "https://cdn.example/share-cards/x.png"
    assert str(moment_id) in out["deepLink"]
    storage.put_bytes.assert_awaited_once()
    session.add.assert_called_once()


@pytest.mark.asyncio
async def test_share_card_returns_existing_without_reupload() -> None:
    moment_id = uuid4()
    actor = Actor(kind="guest", guest_id=uuid4())
    existing = SimpleNamespace(asset_key="share/existing.png")
    session = AsyncMock()
    session.scalar = AsyncMock(return_value=existing)

    storage = MagicMock()
    storage.public_url = MagicMock(return_value="https://cdn.example/share-cards/existing.png")
    storage.put_bytes = AsyncMock()

    with patch("app.modules.sharing.service.get_object_storage", return_value=storage):
        out = await moment_share_card(session, actor, moment_id)

    assert out["assetUrl"].endswith("existing.png")
    storage.put_bytes.assert_not_called()


@pytest.mark.asyncio
async def test_share_card_maps_storage_failure_to_503() -> None:
    moment_id = uuid4()
    option_id = uuid4()
    guest_id = uuid4()
    actor = Actor(kind="guest", guest_id=guest_id)
    response = SimpleNamespace(option_id=option_id)
    option = SimpleNamespace(label="A")
    moment = SimpleNamespace(prompt="Pick one")

    session = AsyncMock()
    session.scalar = AsyncMock(side_effect=[None, response])
    session.get = AsyncMock(side_effect=[moment, option])
    session.add = MagicMock()

    storage = MagicMock()
    storage.put_bytes = AsyncMock(side_effect=RuntimeError("bucket missing"))

    with patch("app.modules.sharing.service.get_object_storage", return_value=storage):
        with pytest.raises(AppError) as exc:
            await moment_share_card(session, actor, moment_id)
    assert exc.value.status_code == 503
    assert exc.value.code == "storage_unavailable"


@pytest.mark.asyncio
async def test_share_card_maps_missing_storage_config_to_503() -> None:
    moment_id = uuid4()
    actor = Actor(kind="guest", guest_id=uuid4())
    session = AsyncMock()

    with patch(
        "app.modules.sharing.service.get_object_storage",
        side_effect=RuntimeError("Supabase Storage credentials are required in production."),
    ):
        with pytest.raises(AppError) as exc:
            await moment_share_card(session, actor, moment_id)
    assert exc.value.status_code == 503
    assert exc.value.code == "storage_unavailable"
