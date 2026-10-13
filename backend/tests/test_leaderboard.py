from datetime import date
from unittest.mock import AsyncMock

import pytest

from app.common.errors import AppError
from app.modules.leaderboard.service import leaderboard, period_start, rank_rows


def test_rank_rows_shares_ranks_on_ties() -> None:
    assert rank_rows([90, 70, 70, 50, 50, 50, 10]) == [1, 2, 2, 4, 4, 4, 7]
    assert rank_rows([]) == []
    assert rank_rows([0, 0]) == [1, 1]


def test_period_start() -> None:
    assert period_start("week", date(2026, 10, 13)) == date(2026, 10, 7)
    assert period_start("all", date(2026, 10, 13)) is None


@pytest.mark.asyncio
@pytest.mark.parametrize(("scope", "period"), [("india", "week"), ("global", "month")])
async def test_rejects_unknown_scope_or_period(scope: str, period: str) -> None:
    with pytest.raises(AppError) as exc:
        await leaderboard(AsyncMock(), scope=scope, period=period, viewer=None)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_friends_board_needs_sign_in() -> None:
    with pytest.raises(AppError) as exc:
        await leaderboard(AsyncMock(), scope="friends", period="week", viewer=None)
    assert exc.value.status_code == 401
