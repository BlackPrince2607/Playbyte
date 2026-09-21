from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.postgres.db import get_session
from app.infrastructure.postgres.models import Category, ContentTag

router = APIRouter(tags=["catalog"])


@router.get("/categories")
async def list_categories(session: AsyncSession = Depends(get_session)) -> dict:
    rows = await session.scalars(select(Category).order_by(Category.sort_order))
    return {"categories": [{"id": str(c.id), "slug": c.slug, "name": c.name} for c in rows]}


@router.get("/content-tags")
async def list_content_tags(session: AsyncSession = Depends(get_session)) -> dict:
    rows = await session.scalars(select(ContentTag).order_by(ContentTag.sort_order))
    return {"tags": [{"id": str(t.id), "slug": t.slug, "name": t.name} for t in rows]}
