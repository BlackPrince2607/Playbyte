from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.api.v1 import me as me_router
from app.infrastructure.postgres.models import NotificationPreference


@pytest.mark.asyncio
async def test_get_notification_preferences_defaults() -> None:
    user_id = uuid4()
    session = AsyncMock()
    session.get = AsyncMock(return_value=None)
    actor = SimpleNamespace(user_id=user_id)

    result = await me_router.get_notif(session=session, actor=actor)

    assert result == {"liveNow": True, "trending": True, "friendActivity": True}


@pytest.mark.asyncio
async def test_get_notification_preferences_stored() -> None:
    user_id = uuid4()
    prefs = SimpleNamespace(live_now=False, trending=True, friend_activity=False)
    session = AsyncMock()
    session.get = AsyncMock(return_value=prefs)
    actor = SimpleNamespace(user_id=user_id)

    result = await me_router.get_notif(session=session, actor=actor)

    assert result == {"liveNow": False, "trending": True, "friendActivity": False}


@pytest.mark.asyncio
async def test_patch_then_get_notification_preferences() -> None:
    user_id = uuid4()
    stored: dict[str, NotificationPreference] = {}

    async def get_pref(_model, uid):
        return stored.get(uid)

    session = AsyncMock()
    session.get = AsyncMock(side_effect=get_pref)
    session.add = lambda row: stored.setdefault(row.user_id, row)
    actor = SimpleNamespace(user_id=user_id)

    await me_router.patch_notif(
        body=me_router.NotifPrefsIn(liveNow=False, trending=True, friendActivity=False),
        session=session,
        actor=actor,
    )

    result = await me_router.get_notif(session=session, actor=actor)
    assert result == {"liveNow": False, "trending": True, "friendActivity": False}


@pytest.mark.asyncio
async def test_patch_profile_and_read_via_get_me() -> None:
    user_id = uuid4()
    profile = SimpleNamespace(
        user_id=user_id,
        display_name="Player",
        bio=None,
        avatar_key=None,
        default_visibility="friends",
    )
    user = SimpleNamespace(id=user_id, age_verified=False)

    async def get_model(model, uid):
        if model.__name__ == "Profile":
            return profile
        return user

    session = AsyncMock()
    session.get = AsyncMock(side_effect=get_model)
    session.add = lambda _row: None
    session.flush = AsyncMock()
    actor = SimpleNamespace(user_id=user_id)

    await me_router.patch_profile(
        body=me_router.ProfileIn(displayName="  Alex  ", bio="Hello crowd"),
        session=session,
        actor=actor,
    )
    await me_router.patch_privacy(
        body=me_router.PrivacyIn(defaultVisibility="public"),
        session=session,
        actor=actor,
    )

    me = await me_router.get_me(session=session, actor=actor)
    assert me["displayName"] == "Alex"
    assert me["bio"] == "Hello crowd"
    assert me["defaultVisibility"] == "public"
