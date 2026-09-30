def clamp_score(score: int, max_score: int) -> int:
    if score < 0:
        return 0
    return min(score, max_score)


def percentile(score: int, others: list[int], lower_is_better: bool = False) -> float:
    """Share of today's plays this score beats (strictly)."""
    if not others:
        return 50.0
    if lower_is_better:
        beaten = sum(1 for s in others if s > score)
    else:
        beaten = sum(1 for s in others if s < score)
    return round(100.0 * beaten / len(others), 1)


def min_plausible_duration_ms(attempts: int | None) -> int:
    """Lower bound for a real SDK play: a short floor plus ~250 ms per graded attempt."""
    return max(800, 250 * max(0, attempts or 0))
