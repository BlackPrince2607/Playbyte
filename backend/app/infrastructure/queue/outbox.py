from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.postgres.models import OutboxEvent


async def enqueue(
    session: AsyncSession,
    event_type: str,
    payload: dict,
    *,
    run_at: datetime | None = None,
) -> None:
    session.add(
        OutboxEvent(
            type=event_type,
            payload=payload,
            status="pending",
            next_attempt_at=run_at or datetime.now(UTC),
        )
    )
