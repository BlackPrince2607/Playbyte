import re

from fastapi import APIRouter, Depends, Header, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors import AppError
from app.infrastructure.postgres.db import get_session
from app.modules.content.service import load_pack, pack_etag

router = APIRouter(prefix="/content", tags=["content"])

_PACK_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_.-]{0,79}$")


@router.get("/packs/{pack_id}")
async def get_pack(
    pack_id: str,
    response: Response,
    session: AsyncSession = Depends(get_session),
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
):
    """Versioned content pack. Public (no personal data); clients revalidate with If-None-Match."""
    if not _PACK_ID_RE.match(pack_id):
        raise AppError("not_found", "Content pack not found.", 404)
    found = await pack_etag(session, pack_id)
    if found is None:
        raise AppError("not_found", "Content pack not found.", 404)
    etag, pack = found
    headers = {"ETag": etag, "Cache-Control": "public, max-age=300"}
    if if_none_match and etag in [t.strip() for t in if_none_match.split(",")]:
        return Response(status_code=304, headers=headers)
    items = await load_pack(session, pack_id, pack)
    response.headers.update(headers)
    return {"packId": pack_id, "etag": etag, "items": items}
