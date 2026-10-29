"""Engagement signals from recent moments — used by the refresh agent to improve the next batch."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.infrastructure.postgres.models import (
    CrowdSnapshot,
    Moment,
    MomentComment,
    MomentLike,
    MomentShare,
)


def _score(responses: int, likes: int, comments: int, shares: int) -> float:
    # Responses are the core swipe action; social reactions weigh a bit heavier as "want more like this".
    return float(responses) + 2.0 * likes + 3.0 * comments + 2.0 * shares


async def moment_performance(
    session: AsyncSession,
    *,
    limit: int = 200,
    statuses: tuple[str, ...] = ("live", "closed", "retired"),
) -> list[dict]:
    """Recent moments with response / like / comment / share counts, newest first."""
    rows = list(
        await session.scalars(
            select(Moment)
            .options(selectinload(Moment.category), selectinload(Moment.options))
            .where(Moment.status.in_(statuses))
            .order_by(Moment.created_at.desc())
            .limit(limit)
        )
    )
    if not rows:
        return []
    ids = [m.id for m in rows]
    snaps = {
        s.moment_id: s
        for s in await session.scalars(select(CrowdSnapshot).where(CrowdSnapshot.moment_id.in_(ids)))
    }
    likes = dict(
        (await session.execute(select(MomentLike.moment_id, func.count()).where(MomentLike.moment_id.in_(ids)).group_by(MomentLike.moment_id))).all()
    )
    shares = dict(
        (await session.execute(select(MomentShare.moment_id, func.count()).where(MomentShare.moment_id.in_(ids)).group_by(MomentShare.moment_id))).all()
    )
    comments = dict(
        (
            await session.execute(
                select(MomentComment.moment_id, func.count())
                .where(MomentComment.moment_id.in_(ids), MomentComment.status == "visible")
                .group_by(MomentComment.moment_id)
            )
        ).all()
    )
    out: list[dict] = []
    for m in rows:
        responses = int(snaps[m.id].total_responses) if m.id in snaps else 0
        like_n = int(likes.get(m.id, 0))
        comment_n = int(comments.get(m.id, 0))
        share_n = int(shares.get(m.id, 0))
        fmt = "quiz" if m.scoring_mode == "correct_option" else "poll"
        out.append(
            {
                "id": str(m.id),
                "categorySlug": m.category.slug if m.category else None,
                "format": fmt,
                "type": m.type,
                "status": m.status,
                "prompt": m.prompt,
                "responses": responses,
                "likes": like_n,
                "comments": comment_n,
                "shares": share_n,
                "score": _score(responses, like_n, comment_n, share_n),
                "optionCount": len(m.options),
            }
        )
    return out


def summarize_for_agent(rows: list[dict], slug: str, *, top_n: int = 5, bottom_n: int = 3) -> dict:
    """Compact hit/miss lessons for one category — safe to stuff into the model prompt."""
    cat = [r for r in rows if r.get("categorySlug") == slug]
    if not cat:
        return {"category": slug, "hits": [], "misses": [], "avoidPrompts": [], "lessons": []}
    ranked = sorted(cat, key=lambda r: (r["score"], r["responses"], r["likes"]), reverse=True)
    engaged = [r for r in ranked if r["score"] > 0]
    hits = engaged[:top_n]
    misses = [r for r in ranked if r["score"] == 0][:bottom_n] or ranked[-bottom_n:]
    lessons: list[str] = []
    if hits:
        poll_hits = sum(1 for r in hits if r["format"] == "poll")
        quiz_hits = sum(1 for r in hits if r["format"] == "quiz")
        if poll_hits >= quiz_hits:
            lessons.append("Indian viewers engaged more with opinion/hot polls in this category — lean into debate and this-or-that.")
        if quiz_hits > poll_hits:
            lessons.append("Quizzes scored well — keep short, punchy trivia with one clear correct answer.")
        avg_opts = sum(r["optionCount"] for r in hits) / len(hits)
        if avg_opts <= 2.2:
            lessons.append("Two-option cards performed well — keep prompts snappy for a fast swipe.")
        else:
            lessons.append("Multi-option pulses got reactions — mix in 3–4 choice cards.")
    else:
        lessons.append("No engagement yet for this category — invent fresh India-trending hooks, not evergreen repeats.")
    return {
        "category": slug,
        "hits": [
            {
                "prompt": r["prompt"][:120],
                "format": r["format"],
                "responses": r["responses"],
                "likes": r["likes"],
                "comments": r["comments"],
                "shares": r["shares"],
            }
            for r in hits
        ],
        "misses": [
            {
                "prompt": r["prompt"][:120],
                "format": r["format"],
                "responses": r["responses"],
                "likes": r["likes"],
            }
            for r in misses
            if r["id"] not in {h["id"] for h in hits}
        ],
        "avoidPrompts": [r["prompt"] for r in cat],
        "lessons": lessons,
    }
