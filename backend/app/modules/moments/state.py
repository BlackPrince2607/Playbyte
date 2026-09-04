from datetime import datetime
from uuid import UUID

ALLOWED = {"draft", "scheduled", "ready", "live", "closed", "retired"}
TRANSITIONS: dict[str, set[str]] = {
    "draft": {"scheduled", "ready"},
    "scheduled": {"ready", "draft"},
    "ready": {"live", "draft"},
    "live": {"closed"},
    "closed": {"retired"},
    "retired": set(),
}


def can_transition(current: str, target: str) -> bool:
    return target in TRANSITIONS.get(current, set())


def restricted_requires_second_approver(restricted_topic: str) -> bool:
    return restricted_topic in {"health", "tragedy", "election"}


def can_go_live(
    *,
    restricted_topic: str,
    distinct_approver_ids: set[UUID],
    now: datetime,
    starts_at: datetime | None,
    ends_at: datetime | None,
) -> tuple[bool, str]:
    if restricted_requires_second_approver(restricted_topic) and len(distinct_approver_ids) < 2:
        return False, "Restricted topics need a second approver."
    if ends_at and ends_at <= now:
        return False, "Moment window has already ended."
    if starts_at and starts_at > now:
        return False, "Moment is scheduled for the future; use scheduled status."
    return True, ""
