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
    """Where the next page resumes. Each seed fixes one pass through that stream; offsets are
    positions within the pass. Opaque to clients.

    Streams are trivia (quiz), poll, and game so the page can cycle priority order
    trivia → game → poll without dumping one kind then the next.
    """

    quiz_seed: int
    quiz_offset: int
    poll_seed: int
    poll_offset: int
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
        if len(values) != 6 or min(values) < 0:
            return None
        return cls(*values)


# Priority mix: trivia first, then a game, then a poll, then repeat.
_MIX_CYCLE = ("quiz", "game", "poll")


def fill_page(
    *,
    rank_quizzes: Callable[[int], list[RankedItem]],
    rank_polls: Callable[[int], list[RankedItem]],
    rank_games: Callable[[int], list[RankedItem]],
    cursor: FeedCursor,
    exclude: set[str],
    limit: int,
    new_seed: Callable[[], int],
) -> tuple[list[RankedItem], FeedCursor | None]:
    """One page of the endless feed in priority mix order: trivia → game → poll → repeat.

    Empty slots are skipped (e.g. no quizzes left → game, poll, game, poll…). Moments and games
    show at most once per page; when a stream runs out it reshuffles with a new seed. The cursor
    is None only when there is nothing left to show at all.
    """
    q_seed, q_offset, p_seed, p_offset, g_seed, g_offset = astuple(cursor)
    quizzes = rank_quizzes(q_seed)
    polls = rank_polls(p_seed)
    games = rank_games(g_seed)
    quiz_pool = {m.id for m in quizzes} - exclude
    poll_pool = {m.id for m in polls} - exclude
    page: list[RankedItem] = []
    used: set[str] = set()
    games_shown = 0
    phase = 0
    stalled = 0

    def next_from(
        seed: int,
        offset: int,
        rows: list[RankedItem],
        rank: Callable[[int], list[RankedItem]],
        pool: set[str],
    ) -> tuple[RankedItem | None, int, int, list[RankedItem]]:
        if not (pool - used):
            return None, seed, offset, rows
        # Finish the current pass, then at most one reshuffle — same pool, new order.
        for _ in range(2):
            while offset < len(rows):
                item = rows[offset]
                offset += 1
                if item.id not in exclude and item.id not in used:
                    return item, seed, offset, rows
            seed, offset = new_seed(), 0
            rows = rank(seed)
            if not rows:
                break
        return None, seed, offset, rows

    def next_game() -> RankedItem | None:
        nonlocal g_seed, g_offset, games, games_shown
        if games_shown >= len(games) or not games:
            return None
        if g_offset >= len(games):
            g_seed, g_offset = new_seed(), 0
            games = rank_games(g_seed)
            if not games:
                return None
        g = games[g_offset]
        g_offset += 1
        return g

    while len(page) < limit:
        before = len(page)
        slot = _MIX_CYCLE[phase % len(_MIX_CYCLE)]
        phase += 1
        if slot == "quiz":
            item, q_seed, q_offset, quizzes = next_from(
                q_seed, q_offset, quizzes, rank_quizzes, quiz_pool
            )
            if item:
                page.append(item)
                used.add(item.id)
        elif slot == "poll":
            item, p_seed, p_offset, polls = next_from(
                p_seed, p_offset, polls, rank_polls, poll_pool
            )
            if item:
                page.append(item)
                used.add(item.id)
        else:
            game = next_game()
            if game:
                page.append(game)
                games_shown += 1

        if len(page) == before:
            stalled += 1
            if stalled >= len(_MIX_CYCLE):
                break
        else:
            stalled = 0

    if not page:
        return page, None
    return page, FeedCursor(q_seed, q_offset, p_seed, p_offset, g_seed, g_offset)


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
    prompt_len: int = 0,
) -> float:
    score = 0.0
    if in_active_window:
        score += 1000
    if interest_match:
        score += 100
    if starts_at:
        age = (now - starts_at).total_seconds()
        score += max(0, 50 - age / 3600)
    # Prefer mobile-readable prompts so long copy does not crowd answer rows.
    if prompt_len:
        if prompt_len <= 60:
            score += 8
        elif prompt_len <= 90:
            score += 3
        else:
            score -= 12
    return score
