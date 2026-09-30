import hashlib
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.postgres.models import ContentItem, ContentPack
from app.modules.content.crowd import merge_crowd

PACK_ID_MAX = 80


def item_to_json(i: ContentItem) -> dict:
    return {
        "id": i.id,
        "type": i.type,
        "schemaVersion": i.schema_version,
        "locale": i.locale,
        "categories": list(i.categories or []),
        "tags": list(i.tags or []),
        "difficulty": i.difficulty,
        "popularity": i.popularity,
        "answer": i.answer,
        "aliases": list(i.aliases or []),
        "attributes": i.attributes or {},
        "media": i.media or [],
        "facts": i.facts or [],
        "hints": list(i.hints or []),
        "distractorGroup": i.distractor_group,
        "source": i.source,
        "status": i.status,
        "version": i.version,
    }


def _pack_filter(pack_id: str, pack: ContentPack | None):
    """WHERE clause for a pack; a pack id with no row means 'approved items of that type'."""
    clauses = [ContentItem.status == "approved"]
    if pack is None:
        clauses.append(ContentItem.type == pack_id)
        return clauses
    clauses.append(ContentItem.type.in_(list(pack.types)))
    if pack.categories:
        clauses.append(ContentItem.categories.overlap(list(pack.categories)))
    if pack.locale:
        clauses.append(ContentItem.locale == pack.locale)
    return clauses


def compute_etag(pack_id: str, count: int, max_updated: datetime | None, version_sum: int, pack_updated: datetime | None) -> str:
    raw = f"{pack_id}|{count}|{max_updated.isoformat() if max_updated else '-'}|{version_sum}|{pack_updated.isoformat() if pack_updated else '-'}"
    return '"' + hashlib.sha256(raw.encode()).hexdigest()[:32] + '"'


async def pack_etag(session: AsyncSession, pack_id: str) -> tuple[str, ContentPack | None] | None:
    """Cheap aggregate ETag so revalidation (If-None-Match) never loads the items."""
    pack = await session.get(ContentPack, pack_id)
    if pack is not None and pack.status != "enabled":
        return None
    where = _pack_filter(pack_id, pack)
    row = (
        await session.execute(
            select(func.count(), func.max(ContentItem.updated_at), func.coalesce(func.sum(ContentItem.version), 0)).where(*where)
        )
    ).one()
    count, max_updated, version_sum = int(row[0] or 0), row[1], int(row[2] or 0)
    if count == 0:
        return None
    return compute_etag(pack_id, count, max_updated, version_sum, pack.updated_at if pack else None), pack


async def load_pack(session: AsyncSession, pack_id: str, pack: ContentPack | None) -> list[dict]:
    limit = pack.max_items if pack else 2000
    rows = await session.scalars(
        select(ContentItem).where(*_pack_filter(pack_id, pack)).order_by(ContentItem.id).limit(limit)
    )
    return [item_to_json(i) for i in rows]


async def upsert_items(session: AsyncSession, items: list[dict]) -> int:
    """Upserts validated items (camelCase dicts from validate_item). Bumps version on change."""
    if not items:
        return 0
    now = datetime.now(UTC)
    choice_ids = [it["id"] for it in items if it["type"] == "choice_pair"]
    existing: dict[str, dict] = {}
    if choice_ids:
        rows = await session.execute(select(ContentItem.id, ContentItem.attributes).where(ContentItem.id.in_(choice_ids)))
        existing = {row[0]: row[1] or {} for row in rows}
    for it in items:
        attributes = merge_crowd(it["attributes"], existing.get(it["id"]))
        values = {
            "id": it["id"],
            "type": it["type"],
            "schema_version": it["schemaVersion"],
            "locale": it["locale"],
            "categories": it["categories"],
            "tags": it["tags"],
            "difficulty": it["difficulty"],
            "popularity": it["popularity"],
            "answer": it["answer"],
            "aliases": it["aliases"],
            "attributes": attributes,
            "media": it["media"],
            "facts": it["facts"],
            "hints": it["hints"],
            "distractor_group": it["distractorGroup"],
            "source": it["source"],
            "status": it["status"],
            "version": it["version"],
            "updated_at": now,
        }
        stmt = insert(ContentItem).values(**values)
        update = {k: stmt.excluded[k] for k in values if k != "id"}
        update["version"] = func.greatest(ContentItem.version + 1, stmt.excluded.version)
        await session.execute(stmt.on_conflict_do_update(index_elements=[ContentItem.id], set_=update))
    return len(items)


async def upsert_pack(
    session: AsyncSession,
    pack_id: str,
    title: str,
    types: list[str],
    categories: list[str],
    locale: str | None,
    max_items: int,
    status: str,
) -> None:
    values = {
        "id": pack_id,
        "title": title,
        "types": types,
        "categories": categories,
        "locale": locale,
        "max_items": max_items,
        "status": status,
        "updated_at": datetime.now(UTC),
    }
    stmt = insert(ContentPack).values(**values)
    await session.execute(
        stmt.on_conflict_do_update(index_elements=[ContentPack.id], set_={k: stmt.excluded[k] for k in values if k != "id"})
    )
