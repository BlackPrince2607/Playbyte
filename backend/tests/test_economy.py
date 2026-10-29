"""Coin rates, streak rules, and purchase matching. No database."""

from datetime import date

import pytest

from app.common.errors import AppError
from app.modules.economy.revenuecat import (
    canonical_transaction_id,
    find_purchase,
    webhook_authorized,
)
from app.modules.economy.rules import (
    FREEZE_COST,
    advance_streak,
    daily_streak_coins,
    game_grant_amount,
    hint_cost,
    moment_grant_amount,
    pack_coins,
    parse_local_date,
    parse_migrate_date,
    streak_payout,
)


def test_daily_streak_grows_then_caps() -> None:
    assert daily_streak_coins(1) == 10
    assert daily_streak_coins(2) == 12
    assert daily_streak_coins(11) == 30
    assert daily_streak_coins(100) == 30


def test_milestone_bonus_is_paid_once() -> None:
    first, newly = streak_payout(7, set())
    assert newly == [7]
    assert first == daily_streak_coins(7) + 20
    again, none = streak_payout(7, {7})
    assert none == []
    assert again == daily_streak_coins(7)
    big, reached = streak_payout(100, set())
    assert reached == [7, 30, 100]
    assert big == 30 + 20 + 50 + 100


def test_freeze_covers_one_missed_day_only() -> None:
    monday = date(2026, 10, 19)
    wednesday = date(2026, 10, 21)
    thursday = date(2026, 10, 22)
    assert advance_streak(4, monday, wednesday, 1) == (5, 0, True)
    assert advance_streak(4, monday, thursday, 1) == (1, 1, False)
    assert advance_streak(4, date(2026, 10, 20), wednesday, 0) == (5, 0, False)
    assert advance_streak(4, wednesday, wednesday, 1) == (4, 1, False)


def test_hint_prices_match_the_hint() -> None:
    assert hint_cost("guess", "clue") == 15
    assert hint_cost("quiz", "fifty") == 25
    assert hint_cost("word_search", "reveal") == 25
    assert hint_cost("word-search", "reveal") == 25
    assert hint_cost("spot_difference", "reveal") == 40
    assert hint_cost("connect_dots", "reveal") == 40
    assert hint_cost("maze", "path") == 40
    with pytest.raises(AppError) as exc:
        hint_cost("tap", "nope")
    assert exc.value.status_code == 422


def test_earn_caps_are_flat() -> None:
    assert game_grant_amount(0) == 5
    assert game_grant_amount(7) == 5
    assert game_grant_amount(8) == 0
    assert moment_grant_amount(0, correct=False) == 2
    assert moment_grant_amount(9, correct=True) == 4
    assert moment_grant_amount(10, correct=True) == 0
    assert FREEZE_COST == 40
    assert pack_coins("coins_80") == 80
    assert pack_coins("coins_2200") == 2200
    assert pack_coins("nope") is None


def test_local_date_window() -> None:
    today = date(2026, 10, 26)
    assert parse_local_date(None, today) == today
    assert parse_local_date("2026-10-25", today) == date(2026, 10, 25)
    assert parse_local_date("2026-10-27", today) == date(2026, 10, 27)
    with pytest.raises(AppError):
        parse_local_date("2026-10-20", today)
    assert parse_migrate_date("2026-01-01", today) == date(2026, 1, 1)
    assert parse_migrate_date("2026-12-01", today) is None
    assert parse_migrate_date("nope", today) is None


def test_purchase_match_accepts_store_or_revenuecat_id() -> None:
    subscriber = {
        "subscriber": {
            "non_subscriptions": {
                "coins_80": [
                    {"id": "rc_1", "store_transaction_id": "store_1", "store": "play_store"},
                ]
            }
        }
    }
    item = find_purchase(subscriber, "coins_80", "store_1")
    assert item is not None
    assert canonical_transaction_id(item) == "store_1"
    assert find_purchase(subscriber, "coins_80", "rc_1") is not None
    assert find_purchase(subscriber, "coins_450", "store_1") is None
    assert find_purchase(subscriber, "coins_80", "other") is None


def test_webhook_authorization() -> None:
    assert webhook_authorized("Bearer secret", "Bearer secret") is True
    assert webhook_authorized("Bearer secret", "Bearer other") is False
    assert webhook_authorized("", "Bearer secret") is False
    assert webhook_authorized("Bearer secret", None) is False
