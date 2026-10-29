"""Tunable coin rates. The server is the authority; the app only displays these."""

from __future__ import annotations

import re
from datetime import UTC, date, datetime, timedelta

from app.common.errors import AppError

FREE_HINTS_PER_DAY = 3
GAME_REWARD = 5
GAME_REWARD_CAP = 8
MOMENT_REWARD = 2
MOMENT_CORRECT_BONUS = 2
MOMENT_REWARD_CAP = 10
WELCOME_GRANT = 30
FREEZE_COST = 40
STREAK_BASE = 10
STREAK_STEP = 2
STREAK_CAP = 30
HINT_LIGHT = 15
HINT_MEDIUM = 25
HINT_STRONG = 40

# (streak day, one-time bonus). Paid once, when the streak first reaches that day.
MILESTONES: tuple[tuple[int, int], ...] = ((7, 20), (30, 50), (100, 100))

PACKS: dict[str, dict[str, int | str | bool]] = {
    "coins_80": {"coins": 80, "displayPrice": "$0.99", "bestValue": False},
    "coins_450": {"coins": 450, "displayPrice": "$4.99", "bestValue": False},
    "coins_1000": {"coins": 1000, "displayPrice": "$9.99", "bestValue": False},
    "coins_2200": {"coins": 2200, "displayPrice": "$19.99", "bestValue": True},
}

_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def pack_coins(product_id: str) -> int | None:
    pack = PACKS.get(product_id)
    if pack is None:
        return None
    return int(pack["coins"])


def pack_catalog() -> list[dict[str, int | str | bool]]:
    return [
        {
            "id": product_id,
            "coins": int(pack["coins"]),
            "displayPrice": str(pack["displayPrice"]),
            "bestValue": bool(pack["bestValue"]),
        }
        for product_id, pack in PACKS.items()
    ]


def daily_streak_coins(count: int) -> int:
    """10 on day 1, plus 2 each extra day, never more than 30."""
    if count <= 0:
        return 0
    return min(STREAK_CAP, STREAK_BASE + STREAK_STEP * (count - 1))


def streak_payout(count: int, granted: set[int]) -> tuple[int, list[int]]:
    """Daily coins plus any milestone this streak has reached and not yet been paid."""
    bonus = 0
    newly: list[int] = []
    for day, amount in MILESTONES:
        if count >= day and day not in granted:
            bonus += amount
            newly.append(day)
    return daily_streak_coins(count) + bonus, newly


def next_milestone(count: int, granted: set[int]) -> dict[str, int] | None:
    for day, bonus in MILESTONES:
        if day > count and day not in granted:
            return {"day": day, "bonus": bonus}
    return None


def advance_streak(current: int, last: date | None, today: date, freezes: int) -> tuple[int, int, bool]:
    """Next streak count, freezes left, and whether a freeze covered the missed day.

    A freeze covers exactly one missed day. A longer gap still resets, and keeps the freeze.
    """
    if last == today:
        return current, freezes, False
    if last is None:
        return 1, freezes, False
    if last == today - timedelta(days=1):
        return current + 1, freezes, False
    if last == today - timedelta(days=2) and freezes > 0:
        return current + 1, freezes - 1, True
    return 1, freezes, False


def hint_cost(engine: str, hint_id: str) -> int:
    """Coin price after the free allowance. Unknown hints are rejected, not free."""
    normalized = engine.replace("-", "_")
    if hint_id == "clue":
        return HINT_LIGHT
    if hint_id == "fifty":
        return HINT_MEDIUM
    if hint_id == "path":
        return HINT_STRONG
    if hint_id == "reveal":
        if normalized == "word_search":
            return HINT_MEDIUM
        return HINT_STRONG
    raise AppError("invalid", "That hint is not available.", 422)


def game_grant_amount(already_rewarded: int) -> int:
    if already_rewarded >= GAME_REWARD_CAP:
        return 0
    return GAME_REWARD


def moment_grant_amount(already_rewarded: int, correct: bool) -> int:
    if already_rewarded >= MOMENT_REWARD_CAP:
        return 0
    return MOMENT_REWARD + (MOMENT_CORRECT_BONUS if correct else 0)


def parse_local_date(raw: str | None, today: date | None = None) -> date:
    """Client local day, kept within a day of UTC so a moved clock cannot farm ahead."""
    anchor = today or datetime.now(UTC).date()
    if raw is None or raw.strip() == "":
        return anchor
    text = raw.strip()
    if not _DATE.match(text):
        raise AppError("invalid", "Send the local date as YYYY-MM-DD.", 422)
    try:
        parsed = date.fromisoformat(text)
    except ValueError:
        raise AppError("invalid", "Send the local date as YYYY-MM-DD.", 422) from None
    if parsed < anchor - timedelta(days=1) or parsed > anchor + timedelta(days=1):
        raise AppError("invalid", "That local date is too far from today.", 422)
    return parsed


def parse_migrate_date(raw: str | None, today: date) -> date | None:
    """Last on-device streak day. Old dates are allowed; future dates are ignored."""
    if raw is None or raw.strip() == "":
        return None
    text = raw.strip()
    if not _DATE.match(text):
        return None
    try:
        parsed = date.fromisoformat(text)
    except ValueError:
        return None
    if parsed > today:
        return None
    return parsed
