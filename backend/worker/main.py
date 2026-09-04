import asyncioimport signalfrom datetime import UTC, datetime, timedeltafrom sqlalchemy import selectfrom app.config import get_settingsfrom app.infrastructure.postgres.db import SessionLocalfrom app.infrastructure.postgres.models import OutboxEventfrom app.infrastructure.realtime.publisher import NoopRealtimePublisher, SupabaseBroadcastPublisherasync def process_once() -> int:
    settings = get_settings()
    publisher = (
        SupabaseBroadcastPublisher(settings.supabase_url, settings.supabase_service_role_key)
        if settings.supabase_url and settings.supabase_service_role_key
        else NoopRealtimePublisher()
    )
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

                    snap = await rebuild_snapshot(session, __import__("uuid").UUID(moment_id))
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
                    from uuid import UUID                    from app.modules.privacy.service import complete_export

                    req_id = UUID(event.payload["requestId"])
                    user_id = UUID(event.payload["userId"])
                    await complete_export(session, req_id, user_id)
                elif event.type == "data.deletion":
                    from uuid import UUID                    from app.modules.privacy.service import complete_deletion

                    req_id = UUID(event.payload["requestId"])
                    user_id = UUID(event.payload["userId"])
                    await complete_deletion(session, user_id, req_id)
                event.status = "done"
                handled += 1
            except Exception:
                event.attempt_count += 1
                event.status = "dead" if event.attempt_count >= 8 else "pending"
                event.next_attempt_at = datetime.now(UTC) + timedelta(seconds=min(300, 2 ** event.attempt_count))
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
        await process_once()
        try:
            await asyncio.wait_for(shutdown.wait(), timeout=1.5)
        except TimeoutError:
            continue


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
