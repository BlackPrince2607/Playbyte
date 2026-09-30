from __future__ import annotations

import random
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class RankedItem:
    kind: str  # moment | mini_game
    id: str
    score: float


def interleave(
    moments: list[RankedItem],
    games: list[RankedItem],
    *,
    hot_window: bool,
) -> list[RankedItem]:
    """Prefer live moments; inject games at a cadence so they never starve a hot window."""
    cadence = 4 if hot_window else 2
    out: list[RankedItem] = []
    gi = 0
    for i, moment in enumerate(moments):
        out.append(moment)
        if games and (i + 1) % cadence == 0 and gi < len(games):
            out.append(games[gi])
            gi += 1
    while gi < len(games):
        out.append(games[gi])
        gi += 1
    return out


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
