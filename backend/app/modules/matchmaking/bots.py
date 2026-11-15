"""Server-side bot opponents for cold Quick Match queues.

Client APIs never expose is_bot / opponent_is_bot — bots look like normal players.
"""

from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.postgres.models import GamePlay, MiniGame, Profile, User
from app.modules.games.scoring import clamp_score, min_plausible_duration_ms

BOT_POOL_SIZE = 32

BOT_SEED: list[tuple[str, str]] = [
    ("bot:pool:01", "Aarav"),
    ("bot:pool:02", "Mia"),
    ("bot:pool:03", "Kabir"),
    ("bot:pool:04", "Sofia"),
    ("bot:pool:05", "Rohan"),
    ("bot:pool:06", "Elena"),
    ("bot:pool:07", "Vihaan"),
    ("bot:pool:08", "Nora"),
    ("bot:pool:09", "Arjun"),
    ("bot:pool:10", "Lila"),
    ("bot:pool:11", "Dev"),
    ("bot:pool:12", "Amelia"),
    ("bot:pool:13", "Ishaan"),
    ("bot:pool:14", "Zara"),
    ("bot:pool:15", "Neil"),
    ("bot:pool:16", "Priya"),
    ("bot:pool:17", "Omar"),
    ("bot:pool:18", "Anya"),
    ("bot:pool:19", "Leo"),
    ("bot:pool:20", "Meera"),
    ("bot:pool:21", "Sam"),
    ("bot:pool:22", "Isha"),
    ("bot:pool:23", "Jay"),
    ("bot:pool:24", "Tara"),
    ("bot:pool:25", "Rex"),
    ("bot:pool:26", "Nina"),
    ("bot:pool:27", "Kian"),
    ("bot:pool:28", "Ava"),
    ("bot:pool:29", "Ravi"),
    ("bot:pool:30", "Maya"),
    ("bot:pool:31", "Finn"),
    ("bot:pool:32", "Diya"),
]


async def ensure_bot_pool(session: AsyncSession) -> int:
    """Create missing bot users/profiles (idempotent). Returns pool size after ensure."""
    existing = list(
        await session.scalars(select(User.auth_subject).where(User.is_bot.is_(True)))
    )
    have = {s for s in existing if s}
    created = 0
    for subject, name in BOT_SEED:
        if subject in have:
            continue
        user = User(auth_subject=subject, status="active", age_verified=True, is_bot=True)
        session.add(user)
        await session.flush()
        session.add(
            Profile(
                user_id=user.id,
                display_name=name,
                avatar_key=None,
                default_visibility="friends",
            )
        )
        created += 1
        have.add(subject)
    if created:
        await session.flush()
    return len(have)


async def pick_bot_opponent(session: AsyncSession, exclude_user_id: UUID) -> User | None:
    await ensure_bot_pool(session)
    rows = list(
        await session.scalars(
            select(User)
            .where(User.is_bot.is_(True), User.id != exclude_user_id, User.status == "active")
            .order_by(func.random())
            .limit(8)
        )
    )
    return rows[0] if rows else None


async def bot_user_id_for_match(session: AsyncSession, match) -> UUID | None:
    for uid in (match.player_a_id, match.player_b_id):
        user = await session.get(User, uid)
        if user and user.is_bot:
            return uid
    return None


async def recent_scores(session: AsyncSession, game_key: str, *, limit: int = 40) -> list[int]:
    since = datetime.now(UTC) - timedelta(days=7)
    return list(
        await session.scalars(
            select(GamePlay.score)
            .where(GamePlay.game_key == game_key, GamePlay.created_at >= since)
            .order_by(GamePlay.created_at.desc())
            .limit(limit)
        )
    )


def competitive_score(
    *,
    human_score: int | None,
    samples: list[int],
    direction: str,
    max_score: int,
) -> int:
    """~50/50 win rate near the human, or a sample from recent plays."""
    lower = direction == "lower_is_better"
    if human_score is not None:
        base = max(0, human_score)
        jitter = random.uniform(0.15, 0.35)
        win = random.random() < 0.5
        if lower:
            # Lower score wins: winning bot scores below human.
            raw = int(base * (1 - jitter)) if win else int(base * (1 + jitter))
        else:
            raw = int(base * (1 + jitter)) if win else int(base * (1 - jitter))
        # Avoid exact ties most of the time.
        if raw == base:
            raw = base + (1 if win ^ lower else -1)
        return clamp_score(max(0, raw), max_score)

    if samples:
        return clamp_score(int(random.choice(samples)), max_score)

    # Cold catalog fallback — middle of a typical mini-game range.
    fallback = random.randint(40, 180) if not lower else random.randint(8, 45)
    return clamp_score(fallback, max_score)


def realistic_duration_ms(*, human_duration_ms: int | None = None) -> int:
    if human_duration_ms and human_duration_ms > 0:
        jitter = random.uniform(0.75, 1.25)
        ms = int(human_duration_ms * jitter)
    else:
        ms = random.randint(18_000, 75_000)
    # Stay above implausible floor used by submit_play.
    floor = min_plausible_duration_ms(None)
    return max(floor, min(ms, 7_200_000))


async def resolve_game_scoring(session: AsyncSession, game_key: str) -> tuple[str, int]:
    game = await session.get(MiniGame, game_key)
    if game is None:
        return "higher_is_better", 1_000_000
    direction = getattr(game, "score_direction", None) or "higher_is_better"
    max_score = int((game.config or {}).get("maxScore") or 1_000_000)
    return direction, max_score
