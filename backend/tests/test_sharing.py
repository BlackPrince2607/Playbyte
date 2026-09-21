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
