"""CMS create_moment persists prompt_hi / label_hi without a live database."""

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.modules.cms.service import create_moment


@pytest.mark.asyncio
async def test_create_moment_stores_hindi_fields() -> None:
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.scalars = AsyncMock(return_value=iter([SimpleNamespace(id=uuid4(), slug="poll")]))

    category_id = uuid4()
    moment = await create_moment(
        session,
        actor_id=None,
        moment_type="predict",
        category_id=category_id,
        prompt="Who wins tonight?",
        prompt_hi="आज रात कौन जीतेगा?",
        options=[
            {"label": "India", "labelHi": "भारत"},
            {"label": "Australia", "labelHi": "ऑस्ट्रेलिया"},
        ],
        starts_at=datetime.now(UTC),
        ends_at=datetime.now(UTC),
        tag_slugs=["poll"],
    )

    assert moment.prompt == "Who wins tonight?"
    assert moment.prompt_hi == "आज रात कौन जीतेगा?"
    assert moment.content_lang == "en"
    # Moment + 2 options + MomentTag + AuditLog
    added = [call.args[0] for call in session.add.call_args_list]
    options = [obj for obj in added if obj.__class__.__name__ == "MomentOption"]
    assert len(options) == 2
    assert options[0].label == "India"
    assert options[0].label_hi == "भारत"
    assert options[1].label_hi == "ऑस्ट्रेलिया"


@pytest.mark.asyncio
async def test_create_moment_stores_hindi_native_content_lang() -> None:
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.scalars = AsyncMock(return_value=iter([SimpleNamespace(id=uuid4(), slug="poll")]))

    moment = await create_moment(
        session,
        actor_id=None,
        moment_type="predict",
        category_id=uuid4(),
        prompt="आज रात कौन जीतेगा?",
        options=[{"label": "भारत"}, {"label": "ऑस्ट्रेलिया"}],
        starts_at=datetime.now(UTC),
        ends_at=datetime.now(UTC),
        tag_slugs=["poll"],
        content_lang="hi",
    )
    assert moment.content_lang == "hi"
    assert moment.prompt == "आज रात कौन जीतेगा?"
    assert moment.prompt_hi is None
