"""Batched gameplay analytics from the client EventBus sink (`POST /v1/events`)."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import Actor
from app.infrastructure.postgres.models import ChoiceVote, ContentItem, GameEvent
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


def event_rows(events: list[dict], actor: Actor, app_version: str | None, now: datetime) -> list[dict]:
    return [
        {
            "type": e["type"],
            "name": e.get("name"),
            "session_id": e["sessionId"],
            "game_key": e["gameKey"],
            "engine": e.get("engineId"),
            "engine_version": e.get("engineVersion"),
            "variation": e.get("variation"),
            "round": e.get("round"),
            "seed": e.get("seed"),
            "clock_ms": e.get("clockMs"),
            "props": e.get("props"),
            "client_ts": client_time(e.get("ts"), now),
            "app_version": app_version,
            "user_id": actor.user_id,
            "guest_session_id": actor.guest_id,
            "client_event_id": e.get("eventId"),
        }
        for e in events
    ]


def choice_picks(events: list[dict]) -> list[tuple[str, str, str]]:
    """(item, session, vote) for prefer-mode picks; the first pick per session and pair wins."""
    seen: set[tuple[str, str]] = set()
    picks: list[tuple[str, str, str]] = []
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
        picks.append((item, e["sessionId"], vote))
    return picks


def tally(votes: list[tuple[str, str]]) -> dict[str, list[int]]:
    """(item, vote) pairs to {item: [a, b]}."""
    out: dict[str, list[int]] = {}
    for item, vote in votes:
        out.setdefault(item, [0, 0])[0 if vote == "a" else 1] += 1
    return out


def apply_crowd(items: dict[str, ContentItem], tallies: dict[str, list[int]], now: datetime) -> int:
    """Adds votes to the given pairs. Returns how many pairs changed."""
    updated = 0
    for item_id, (a, b) in tallies.items():
        item = items.get(item_id)
        if item is None:
            continue
        attrs, split_changed = crowd_attributes(dict(item.attributes or {}), a, b)
        item.attributes = attrs
        # Only a visible change invalidates the pack ETag; vote counts alone ride along with the next one.
        if split_changed:
            item.updated_at = now
        updated += 1
    return updated


async def insert_events(session: AsyncSession, rows: list[dict]) -> int:
    """Inserts events; a (session, client event id) already stored is skipped. Returns rows inserted."""
    stmt = (
        insert(GameEvent)
        .values(rows)
        .on_conflict_do_nothing(
            index_elements=[GameEvent.session_id, GameEvent.client_event_id],
            index_where=GameEvent.client_event_id.is_not(None),
        )
        .returning(GameEvent.id)
    )
    return len((await session.execute(stmt)).all())


async def record_choice_votes(
    session: AsyncSession, actor: Actor, picks: list[tuple[str, str, str]], now: datetime
) -> int:
    """Stores new votes and folds them into the pairs' crowd attributes. Returns pairs updated.

    The pairs are locked (in id order, so concurrent batches cannot deadlock) before votes are
    inserted, so two requests never read the same tally and overwrite each other's increment.
    """
    if not picks:
        return 0
    ids = sorted({item for item, _, _ in picks})
    locked = await session.scalars(
        select(ContentItem)
        .where(ContentItem.id.in_(ids), ContentItem.type == "choice_pair", ContentItem.status == "approved")
        .order_by(ContentItem.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    items = {i.id: i for i in locked}
    rows = [
        {"item_id": item, "session_id": sid, "vote": vote, "user_id": actor.user_id, "guest_session_id": actor.guest_id}
        for item, sid, vote in picks
        if item in items
    ]
    if not rows:
        return 0
    stmt = (
        insert(ChoiceVote)
        .values(rows)
        .on_conflict_do_nothing(index_elements=[ChoiceVote.item_id, ChoiceVote.session_id])
        .returning(ChoiceVote.item_id, ChoiceVote.vote)
    )
    new_votes = [(r[0], r[1]) for r in (await session.execute(stmt)).all()]
    return apply_crowd(items, tally(new_votes), now)


async def record_events(session: AsyncSession, actor: Actor, events: list[dict], app_version: str | None) -> dict:
    now = datetime.now(UTC)
    inserted = await insert_events(session, event_rows(events, actor, app_version, now))
    pairs = await record_choice_votes(session, actor, choice_picks(events), now)
    await session.flush()
    return {"accepted": len(events), "duplicates": len(events) - inserted, "choicePairsUpdated": pairs}
