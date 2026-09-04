def clamp_score(score: int, max_score: int) -> int:
    if score < 0:
        return 0
    return min(score, max_score)


def percentile(score: int, others: list[int]) -> float:
    if not others:
        return 50.0
    below = sum(1 for s in others if s < score)
    return round(100.0 * below / len(others), 1)
