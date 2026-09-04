from datetime import UTC, datetime
from uuid import uuid4

from app.modules.crowd.volume import volume_label, volume_state
from app.modules.feed.ranking import RankedItem, interleave
from app.modules.games.scoring import clamp_score, percentile
from app.modules.moments.state import (
    can_go_live,
    can_transition,
    restricted_requires_second_approver,
)
from app.modules.notifications.policy import DAILY_CAP, eligible_to_send, majority_match_rate


def test_volume_states() -> None:
    assert volume_state(0) == "nascent"
    assert volume_state(49) == "nascent"
    assert volume_state(50) == "building"
    assert volume_state(500) == "mature"
    assert "first 50" in volume_label("nascent", 3)


def test_moment_transitions() -> None:
    assert can_transition("draft", "ready")
    assert can_transition("ready", "live")
    assert not can_transition("live", "draft")
    assert restricted_requires_second_approver("election")
    ok, _ = can_go_live(
        restricted_topic="election",
        distinct_approver_ids={uuid4()},
        now=datetime.now(UTC),
        starts_at=None,
        ends_at=None,
    )
    assert not ok
    ok2, _ = can_go_live(
        restricted_topic="none",
        distinct_approver_ids=set(),
        now=datetime.now(UTC),
        starts_at=None,
        ends_at=None,
    )
    assert ok2


def test_feed_interleave_hot_window() -> None:
    moments = [RankedItem("moment", str(i), 10) for i in range(8)]
    games = [RankedItem("mini_game", f"g{i}", 1) for i in range(4)]
    hot = interleave(moments, games, hot_window=True)
    kinds = [i.kind for i in hot]
    assert kinds.count("mini_game") <= kinds.count("moment")


def test_score_clamp_and_percentile() -> None:
    assert clamp_score(-1, 100) == 0
    assert clamp_score(999, 100) == 100
    assert percentile(10, [1, 2, 3, 4, 5]) == 100.0
    assert percentile(1, []) == 50.0


def test_notification_cap() -> None:
    assert eligible_to_send(pref_enabled=True, moment_open=True, sent_today=2)
    assert not eligible_to_send(pref_enabled=True, moment_open=True, sent_today=DAILY_CAP)
    assert not eligible_to_send(pref_enabled=True, moment_open=False, sent_today=0)
    assert majority_match_rate(0, 0) == 0.0
    assert majority_match_rate(4, 3) == 75.0
