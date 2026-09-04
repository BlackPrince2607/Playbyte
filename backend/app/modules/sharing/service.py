from io import BytesIOfrom uuid import UUID, uuid4from PIL import Image, ImageDrawfrom sqlalchemy import selectfrom sqlalchemy.ext.asyncio import AsyncSessionfrom app.common.auth import Actorfrom app.common.errors import AppErrorfrom app.infrastructure.postgres.models import Moment, MomentOption, Response, ShareCardfrom app.infrastructure.storage.objects import get_object_storageasync def moment_share_card(session: AsyncSession, actor: Actor, moment_id: UUID) -> dict:
    storage = get_object_storage()
    stmt = select(ShareCard).where(ShareCard.moment_id == moment_id)
    if actor.user_id:
        stmt = stmt.where(ShareCard.user_id == actor.user_id)
    else:
        stmt = stmt.where(ShareCard.guest_session_id == actor.guest_id)
    existing = await session.scalar(stmt)
    if existing:
        return {
            "assetUrl": storage.public_url("share-cards", existing.asset_key),
            "deepLink": f"playbyte://moments/{moment_id}",
        }

    moment = await session.get(Moment, moment_id)
    if moment is None:
        raise AppError("not_found", "Moment not found.", 404)
    stmt = select(Response).where(Response.moment_id == moment_id)
    if actor.user_id:
        stmt = stmt.where(Response.user_id == actor.user_id)
    else:
        stmt = stmt.where(Response.guest_session_id == actor.guest_id)
    response = await session.scalar(stmt)
    if response is None:
        raise AppError("forbidden", "Share is available after you respond.", 403)
    option = await session.get(MomentOption, response.option_id)
    png = _render(moment.prompt, option.label if option else "?")
    key = f"share/{moment_id}/{uuid4().hex}.png"
    url = await storage.put_bytes("share-cards", key, png, "image/png")
    session.add(
        ShareCard(
            moment_id=moment_id,
            user_id=actor.user_id,
            guest_session_id=actor.guest_id,
            asset_key=key,
        )
    )
    return {"assetUrl": url, "deepLink": f"playbyte://moments/{moment_id}"}


def _render(prompt: str, answer: str) -> bytes:
    img = Image.new("RGB", (1080, 1350), "#150E2B")
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((60, 80, 1020, 1270), radius=48, fill="#211540")
    draw.text((100, 140), "PLAY", fill="#FF4D8D")
    draw.text((100, 280), prompt[:80], fill="#F5F0FF")
    draw.text((100, 520), f"I chose {answer}", fill="#C6FF3D")
    draw.text((100, 1100), "Join the crowd", fill="#8F7FC0")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
