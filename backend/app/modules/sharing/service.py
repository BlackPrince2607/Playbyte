from io import BytesIO
from uuid import UUID, uuid4

from PIL import Image, ImageDraw
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import Actor
from app.common.errors import AppError
from app.infrastructure.postgres.models import GamePlay, MiniGame, Moment, MomentOption, Response, ShareCard
from app.infrastructure.storage.objects import get_object_storage
from app.modules.games.scoring import percentile


def _storage_or_503():
    try:
        return get_object_storage()
    except Exception as exc:  # noqa: BLE001 — missing Supabase config must not opaque-500
        raise AppError(
            "storage_unavailable",
            "Share card storage is unavailable. Try again later.",
            503,
        ) from exc


async def _upload_png(storage, key: str, png: bytes) -> str:
    try:
        return await storage.put_bytes("share-cards", key, png, "image/png")
    except AppError:
        raise
    except Exception as exc:  # noqa: BLE001 — surface storage/render misconfig to clients
        raise AppError(
            "storage_unavailable",
            "Share card storage is unavailable. Try again later.",
            503,
        ) from exc


async def moment_share_card(session: AsyncSession, actor: Actor, moment_id: UUID) -> dict:
    storage = _storage_or_503()

    stmt = select(ShareCard).where(ShareCard.moment_id == moment_id)
    if actor.user_id:
        stmt = stmt.where(ShareCard.user_id == actor.user_id)
    else:
        stmt = stmt.where(ShareCard.guest_session_id == actor.guest_id)
    existing = await session.scalar(stmt)
    if existing:
        return {
            "assetUrl": storage.public_url("share-cards", existing.asset_key),
            "deepLink": f"maja://moments/{moment_id}",
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
    png = _render_moment(moment.prompt, option.label if option else "?")
    key = f"share/{moment_id}/{uuid4().hex}.png"
    url = await _upload_png(storage, key, png)
    session.add(
        ShareCard(
            moment_id=moment_id,
            user_id=actor.user_id,
            guest_session_id=actor.guest_id,
            asset_key=key,
        )
    )
    return {"assetUrl": url, "deepLink": f"maja://moments/{moment_id}"}


async def play_share_card(session: AsyncSession, actor: Actor, game_key: str, play_id: UUID) -> dict:
    """Generate a brag card for a saved trivia / emoji / mini-game play."""
    storage = _storage_or_503()

    play = await session.get(GamePlay, play_id)
    if play is None or play.game_key != game_key:
        raise AppError("not_found", "Play not found.", 404)
    owns = (actor.user_id and play.user_id == actor.user_id) or (
        actor.guest_id and play.guest_session_id == actor.guest_id
    )
    if not owns:
        raise AppError("forbidden", "Share is available for your own plays.", 403)

    # One cached card per play path: reuse if we already rendered this exact play.
    stmt = select(ShareCard).where(ShareCard.game_key == game_key, ShareCard.asset_key.like(f"share/plays/{play_id}/%"))
    if actor.user_id:
        stmt = stmt.where(ShareCard.user_id == actor.user_id)
    else:
        stmt = stmt.where(ShareCard.guest_session_id == actor.guest_id)
    existing = await session.scalar(stmt)
    if existing:
        return {
            "assetUrl": storage.public_url("share-cards", existing.asset_key),
            "deepLink": f"maja://games/{game_key}",
        }

    game = await session.get(MiniGame, game_key)
    title = game.title if game else game_key

    summary = play.summary if isinstance(play.summary, dict) else {}
    correct = summary.get("correct")
    attempts = summary.get("attempts")
    line = None
    if isinstance(correct, int) and isinstance(attempts, int) and attempts > 0:
        line = f"{correct}/{attempts} correct"

    pct_line = None
    scores = list(
        await session.scalars(
            select(GamePlay.score).where(GamePlay.game_key == game_key).order_by(GamePlay.created_at.desc()).limit(200)
        )
    )
    if scores:
        direction = (game.score_direction if game else "higher_is_better") or "higher_is_better"
        pct = percentile(play.score, scores, lower_is_better=direction == "lower_is_better")
        pct_line = f"Better than {pct:.0f}% of players"

    png = _render_play(title, play.score, detail=line, brag=pct_line)
    key = f"share/plays/{play_id}/{uuid4().hex}.png"
    url = await _upload_png(storage, key, png)
    session.add(
        ShareCard(
            moment_id=None,
            game_key=game_key,
            user_id=actor.user_id,
            guest_session_id=actor.guest_id,
            asset_key=key,
        )
    )
    return {"assetUrl": url, "deepLink": f"maja://games/{game_key}"}


def _render_moment(prompt: str, answer: str) -> bytes:
    img = Image.new("RGB", (1080, 1350), "#150E2B")
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((60, 80, 1020, 1270), radius=48, fill="#211540")
    draw.text((100, 140), "MAJA", fill="#FF4D8D")
    draw.text((100, 280), prompt[:80], fill="#F5F0FF")
    draw.text((100, 520), f"I chose {answer}", fill="#C6FF3D")
    draw.text((100, 1100), "Join the crowd", fill="#8F7FC0")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _render_play(title: str, score: int, *, detail: str | None = None, brag: str | None = None) -> bytes:
    img = Image.new("RGB", (1080, 1350), "#150E2B")
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((60, 80, 1020, 1270), radius=48, fill="#211540")
    draw.text((100, 140), "MAJA", fill="#FF4D8D")
    draw.text((100, 260), (title or "Game")[:48], fill="#F5F0FF")
    draw.text((100, 420), "I scored", fill="#8F7FC0")
    draw.text((100, 520), str(score), fill="#C6FF3D")
    y = 700
    if detail:
        draw.text((100, y), detail[:60], fill="#F5F0FF")
        y += 80
    if brag:
        draw.text((100, y), brag[:60], fill="#F5F0FF")
    draw.text((100, 1100), "Can you beat me?", fill="#8F7FC0")
    draw.text((100, 1180), "Play on MAJA", fill="#FF4D8D")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# Back-compat for existing tests
def _render(prompt: str, answer: str) -> bytes:
    return _render_moment(prompt, answer)

