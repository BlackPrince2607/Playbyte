from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import Actor, get_actor
from app.infrastructure.postgres.db import get_session
from app.infrastructure.postgres.models import Report

router = APIRouter(tags=["reports"])


class ReportIn(BaseModel):
    targetType: str = Field(max_length=40)
    targetId: str = Field(max_length=80)
    reason: str | None = Field(default=None, max_length=500)


@router.post("/reports")
async def create_report(
    body: ReportIn,
    session: AsyncSession = Depends(get_session),
    actor: Actor = Depends(get_actor),
) -> dict:
    row = Report(
        reporter_user_id=actor.user_id,
        reporter_guest_id=actor.guest_id,
        target_type=body.targetType,
        target_id=body.targetId,
        reason=body.reason,
    )
    session.add(row)
    await session.flush()
    return {"id": str(row.id), "status": row.status}
