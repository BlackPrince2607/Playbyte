"""Live crowd splits for Choice pairs, aggregated from `choice_pick` analytics events.

`attributes.crowd = {"a": n, "b": m}` is server-owned. Once a pair has CROWD_MIN_VOTES votes, the
client-facing `attributes.split` (% choosing A) is replaced by the measured one; below that the
editorial seed value stays. `attributes.votes` is the total the client shows.
"""

CROWD_MIN_VOTES = 30


def crowd_attributes(attrs: dict, add_a: int, add_b: int) -> tuple[dict, bool]:
    """New attributes after adding votes, and whether the displayed split changed."""
    crowd = attrs.get("crowd") if isinstance(attrs.get("crowd"), dict) else {}
    a = max(0, int(crowd.get("a", 0) or 0)) + add_a
    b = max(0, int(crowd.get("b", 0) or 0)) + add_b
    out = {**attrs, "crowd": {"a": a, "b": b}, "votes": a + b}
    if a + b >= CROWD_MIN_VOTES:
        out["split"] = round(100 * a / (a + b))
    return out, out.get("split") != attrs.get("split")


def merge_crowd(new_attrs: dict, old_attrs: dict | None) -> dict:
    """Content re-imports replace attributes wholesale; carry the live crowd data across."""
    if not old_attrs or not isinstance(old_attrs.get("crowd"), dict):
        return new_attrs
    merged = {**new_attrs, "crowd": old_attrs["crowd"], "votes": old_attrs.get("votes", 0)}
    if int(old_attrs.get("votes", 0) or 0) >= CROWD_MIN_VOTES and "split" in old_attrs:
        merged["split"] = old_attrs["split"]
    return merged
