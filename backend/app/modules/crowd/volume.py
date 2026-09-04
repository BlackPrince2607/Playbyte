"""Crowd volume labels from real counts only — never fabricated."""


def volume_state(total: int) -> str:
    if total < 50:
        return "nascent"
    if total < 500:
        return "building"
    return "mature"


def volume_label(state: str, total: int) -> str:
    if state == "nascent":
        remaining = max(0, 50 - total)
        return f"Be the first 50 to weigh in · {total} so far" if remaining else f"{total} playing"
    if state == "building":
        return f"{total} playing · crowd still forming"
    return f"{total} playing"
