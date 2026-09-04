from datetime import datetime

DAILY_CAP = 3


def eligible_to_send(
    *,
    pref_enabled: bool,
    moment_open: bool,
    sent_today: int,
    now: datetime | None = None,
) -> bool:
    if not pref_enabled:
        return False
    if not moment_open:
        return False
    return sent_today < DAILY_CAP


def majority_match_rate(joined: int, matches: int) -> float:
    if joined <= 0:
        return 0.0
    return round(100.0 * matches / joined, 1)
