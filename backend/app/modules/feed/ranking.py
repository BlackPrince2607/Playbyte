from __future__ import annotations

import random
from collections.abc import Callable
from dataclasses import astuple, dataclass
from datetime import datetime


@dataclass(frozen=True)
class RankedItem:
    kind: str  # moment | mini_game
    id: str
    score: float


@dataclass(frozen=True)
class FeedCursor:
    """Where the next page resumes: each seed fixes one pass through moments / games, the offset is the
    position within that pass. Opaque to clients."""

    moment_seed: int
    moment_offset: int
    game_seed: int
    game_offset: int

    def encode(self) -> str:
        return ".".join(str(v) for v in astuple(self))

    @classmethod
    def decode(cls, raw: str) -> FeedCursor | None:
        try:
            values = [int(v) for v in raw.split(".")]
        except ValueError:
            return None
        if len(values) != 4 or min(values) < 0:
            return None
        return cls(*values)


def fill_page(
    *,
    rank_moments: Callable[[int], list[RankedItem]],
    rank_games: Callable[[int], list[RankedItem]],
    cursor: FeedCursor,
    exclude: set[str],
    limit: int,
    cadence: int,
    new_seed: Callable[[], int],
) -> tuple[list[RankedItem], FeedCursor | None]:
    """One page of the endless feed: moments continue from the cursor and start a fresh pass (new seed)
    when one runs out, with a game after every `cadence` moments. Each moment and game shows at most once
    per page; the cursor is None only when there is nothing left to show at all."""
    m_seed, m_offset, g_seed, g_offset = astuple(cursor)
    moments = rank_moments(m_seed)
    games = rank_games(g_seed)
    servable = len({m.id for m in moments} - exclude)
    page: list[RankedItem] = []
    used: set[str] = set()
    games_shown = 0
    since_game = 0

    def next_moment() -> RankedItem | None:
        nonlocal m_seed, m_offset, moments
        if len(used) >= servable:
            return None
        while True:
            if m_offset >= len(moments):
                m_seed, m_offset = new_seed(), 0
                moments = rank_moments(m_seed)
            m = moments[m_offset]
            m_offset += 1
            if m.id not in exclude and m.id not in used:
                return m

    def next_game() -> RankedItem:
        nonlocal g_seed, g_offset, games
        if g_offset >= len(games):
            g_seed, g_offset = new_seed(), 0
            games = rank_games(g_seed)
        g = games[g_offset]
        g_offset += 1
        return g

    while len(page) < limit:
        game_due = since_game >= cadence and games_shown < len(games)
        moment = None if game_due else next_moment()
        if moment:
            page.append(moment)
            used.add(moment.id)
            since_game += 1
        elif games_shown < len(games):
            page.append(next_game())
            games_shown += 1
            since_game = 0
        else:
            break

    if not page:
        return page, None
    return page, FeedCursor(m_seed, m_offset, g_seed, g_offset)


def rotate_games[T](games: list[T], engine_of: Callable[[T], str | None], rng: random.Random) -> list[T]:
    """Round-robin across engines in a shuffled order, so a feed page (only a handful of game slots)
    covers as many engines as possible and successive feeds surface every enabled game."""
    by_engine: dict[str, list[T]] = {}
    for g in games:
        by_engine.setdefault(engine_of(g) or "", []).append(g)
    queues = list(by_engine.values())
    for q in queues:
        rng.shuffle(q)
    rng.shuffle(queues)
    out: list[T] = []
    while any(queues):
        for q in queues:
            if q:
                out.append(q.pop())
    return out


def moment_score(
    *,
    now: datetime,
    starts_at: datetime | None,
    in_active_window: bool,
    interest_match: bool,
) -> float:
    score = 0.0
    if in_active_window:
        score += 1000
    if interest_match:
        score += 100
    if starts_at:
        age = (now - starts_at).total_seconds()
        score += max(0, 50 - age / 3600)
    return score
