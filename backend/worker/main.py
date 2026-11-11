import asyncio
import signal
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select

from app.config import get_settings
from app.infrastructure.postgres.db import SessionLocal
from app.infrastructure.postgres.models import OutboxEvent
from app.infrastructure.realtime.publisher import NoopRealtimePublisher, SupabaseBroadcastPublisher


def _publisher():
    settings = get_settings()
    if settings.supabase_url and settings.supabase_service_role_key:
        return SupabaseBroadcastPublisher(settings.supabase_url, settings.supabase_service_role_key)
    return NoopRealtimePublisher()


async def maintain_matchmaking() -> None:
    """Pair queue, emit ready signals, and finalize deadlines (M11/M12)."""
    settings = get_settings()
    if not settings.online_matchmaking_enabled:
        return
    from app.modules.matchmaking import service as mm

    async with SessionLocal() as session:
        if await mm.advisory_pair_lock(session):
            await mm.pair_searching_tickets(session)
        await mm.mark_ready_matches(session)
        await mm.finalize_due_matches(session)
        await session.commit()


async def process_once() -> int:
    publisher = _publisher()
    handled = 0
    async with SessionLocal() as session:
        rows = list(
            await session.scalars(
                select(OutboxEvent)
                .where(OutboxEvent.status == "pending", OutboxEvent.next_attempt_at <= datetime.now(UTC))
                .order_by(OutboxEvent.created_at)
                .with_for_update(skip_locked=True)
                .limit(50)
            )
        )
        for event in rows:
            event.status = "processing"
            try:
                if event.type == "response.created":
                    moment_id = event.payload["momentId"]
                    from app.modules.responses.service import rebuild_snapshot

                    snap = await rebuild_snapshot(session, UUID(moment_id))
                    await publisher.publish_crowd_snapshot(
                        moment_id,
                        {
                            "event": "crowd.snapshot",
                            "momentId": moment_id,
                            "version": snap.version,
                            "generatedAt": snap.generated_at.isoformat() if snap.generated_at else None,
                            "totalResponses": snap.total_responses,
                            "optionCounts": snap.option_counts,
                            "joinedLastMinute": snap.joined_last_minute,
                            "volumeState": snap.volume_state,
                        },
                    )
                elif event.type == "data.export":
                    from app.modules.privacy.service import complete_export

                    req_id = UUID(event.payload["requestId"])
                    user_id = UUID(event.payload["userId"])
                    await complete_export(session, req_id, user_id)
                elif event.type == "data.deletion":
                    from app.modules.privacy.service import complete_deletion

                    req_id = UUID(event.payload["requestId"])
                    user_id = UUID(event.payload["userId"])
                    await complete_deletion(session, user_id, req_id)
                elif event.type == "match.notify":
                    await publisher.publish_user_event(
                        event.payload["userId"],
                        event.payload["event"],
                        event.payload.get("payload") or {},
                    )
                elif event.type == "match.ready":
                    # Lobby go-signal is also fanned out via match.notify; this keeps a durable marker.
                    match_id = event.payload.get("matchId")
                    if match_id:
                        await publisher.publish_user_event(
                            "system",
                            "match.ready",
                            event.payload,
                        )
                event.status = "done"
                handled += 1
            except Exception:
                event.attempt_count += 1
                event.status = "dead" if event.attempt_count >= 8 else "pending"
                event.next_attempt_at = datetime.now(UTC) + timedelta(
                    seconds=min(300, 2**event.attempt_count)
                )
        await session.commit()
    return handled


async def run() -> None:
    shutdown = asyncio.Event()

    def request_shutdown(*_: object) -> None:
        shutdown.set()

    loop = asyncio.get_running_loop()
    for sig in (getattr(signal, "SIGTERM", None), getattr(signal, "SIGINT", None)):
        if sig is not None:
            try:
                loop.add_signal_handler(sig, request_shutdown)
            except NotImplementedError:
                signal.signal(sig, lambda *_: request_shutdown())

    while not shutdown.is_set():
        await maintain_matchmaking()
        await process_once()
        try:
            await asyncio.wait_for(shutdown.wait(), timeout=1.0)
        except TimeoutError:
            continue


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
