"""Batched gameplay analytics from the client EventBus sink (`POST /v1/events`)."""

from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import Actor
from app.infrastructure.postgres.models import ContentItem, GameEvent
from app.modules.content.crowd import crowd_attributes

# Client timestamps outside this window are unreliable (bad clocks, replayed queues) and stored as null.
CLIENT_TS_PAST = timedelta(days=7)
CLIENT_TS_FUTURE = timedelta(days=1)


def client_time(ts_ms: int | None, now: datetime) -> datetime | None:
    if ts_ms is None:
        return None
    try:
        t = datetime.fromtimestamp(ts_ms / 1000, UTC)
    except (OverflowError, OSError, ValueError):
        return None
    return t if now - CLIENT_TS_PAST <= t <= now + CLIENT_TS_FUTURE else None


def choice_tallies(events: list[dict]) -> dict[str, list[int]]:
    """Votes per Choice pair from prefer-mode picks; one vote per session and pair."""
    seen: set[tuple[str, str]] = set()
    tallies: dict[str, list[int]] = {}
    for e in events:
        if e.get("type") != "ENGINE" or e.get("name") != "choice_pick":
            continue
        props = e.get("props") or {}
        item, vote = props.get("item"), props.get("vote")
        if props.get("mode") != "prefer" or not isinstance(item, str) or vote not in ("a", "b"):
            continue
        key = (e["sessionId"], item)
        if key in seen:
            continue
        seen.add(key)
        t = tallies.setdefault(item, [0, 0])
        t[0 if vote == "a" else 1] += 1
    return tallies


async def apply_choice_votes(session: AsyncSession, tallies: dict[str, list[int]], now: datetime) -> int:
    """Adds votes to approved Choice pairs. Returns how many pairs were updated."""
    updated = 0
    for item_id, (a, b) in tallies.items():
        item = await session.get(ContentItem, item_id)
        if item is None or item.type != "choice_pair" or item.status != "approved":
            continue
        attrs, split_changed = crowd_attributes(dict(item.attributes or {}), a, b)
        item.attributes = attrs
        # Only a visible change invalidates the pack ETag; vote counts alone ride along with the next one.
        if split_changed:
            item.updated_at = now
        updated += 1
    return updated


async def record_events(session: AsyncSession, actor: Actor, events: list[dict], app_version: str | None) -> dict:
    now = datetime.now(UTC)
    for e in events:
        session.add(
            GameEvent(
                type=e["type"],
                name=e.get("name"),
                session_id=e["sessionId"],
                game_key=e["gameKey"],
                engine=e.get("engineId"),
                engine_version=e.get("engineVersion"),
                variation=e.get("variation"),
                round=e.get("round"),
                seed=e.get("seed"),
                clock_ms=e.get("clockMs"),
                props=e.get("props"),
                client_ts=client_time(e.get("ts"), now),
                app_version=app_version,
                user_id=actor.user_id,
                guest_session_id=actor.guest_id,
            )
        )
    pairs = await apply_choice_votes(session, choice_tallies(events), now)
    await session.flush()
    return {"accepted": len(events), "choicePairsUpdated": pairs}
