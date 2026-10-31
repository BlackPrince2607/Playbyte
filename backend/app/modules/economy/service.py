"""Server-owned coin wallet.

Balance changes only inside `apply_delta`, in the same transaction as the ledger row.
Game score is never an input: a finished play pays a flat amount, capped per day.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors import AppError
from app.infrastructure.postgres.models import (
    CoinLedger,
    EconomyDay,
    IapPurchase,
    UserStreak,
    Wallet,
)
from app.modules.economy.rules import (
    FREE_HINTS_PER_DAY,
    FREEZE_COST,
    GAME_REWARD_CAP,
    MILESTONES,
    MOMENT_REWARD_CAP,
    WELCOME_GRANT,
    advance_streak,
    daily_streak_coins,
    game_grant_amount,
    hint_cost,
    moment_grant_amount,
    next_milestone,
    pack_catalog,
    pack_coins,
    parse_migrate_date,
    streak_payout,
)


@dataclass
class LedgerResult:
    delta: int
    balance: int
    created: bool


def _today(local_day: date | None) -> date:
    return local_day or datetime.now(UTC).date()


async def _ensure_wallet(session: AsyncSession, user_id: UUID) -> Wallet:
    await session.execute(pg_insert(Wallet).values(user_id=user_id, balance=0).on_conflict_do_nothing())
    wallet = await session.scalar(select(Wallet).where(Wallet.user_id == user_id).with_for_update())
    if wallet is None:
        raise AppError("conflict", "Could not open the coin wallet.", 409)
    return wallet


async def _ensure_day(session: AsyncSession, user_id: UUID, day: date) -> EconomyDay:
    await session.execute(
        pg_insert(EconomyDay)
        .values(
            user_id=user_id,
            day=day,
            free_hints_used=0,
            games_rewarded=0,
            moments_rewarded=0,
            streak_claimed=False,
        )
        .on_conflict_do_nothing()
    )
    row = await session.scalar(
        select(EconomyDay).where(EconomyDay.user_id == user_id, EconomyDay.day == day).with_for_update()
    )
    if row is None:
        raise AppError("conflict", "Could not open today's coin limits.", 409)
    return row


async def _ensure_streak(session: AsyncSession, user_id: UUID) -> UserStreak:
    await session.execute(pg_insert(UserStreak).values(user_id=user_id).on_conflict_do_nothing())
    row = await session.scalar(select(UserStreak).where(UserStreak.user_id == user_id).with_for_update())
    if row is None:
        raise AppError("conflict", "Could not open the streak.", 409)
    return row


async def _ledger(session: AsyncSession, key: str) -> CoinLedger | None:
    return await session.scalar(select(CoinLedger).where(CoinLedger.idempotency_key == key))


async def apply_delta(
    session: AsyncSession,
    user_id: UUID,
    delta: int,
    reason: str,
    idempotency_key: str,
    *,
    ref_type: str | None = None,
    ref_id: str | None = None,
) -> LedgerResult:
    """Credit or debit. A repeated idempotency key does not move the balance again."""
    existing = await _ledger(session, idempotency_key)
    wallet = await _ensure_wallet(session, user_id)
    if existing is not None:
        return LedgerResult(delta=0, balance=int(wallet.balance), created=False)
    if delta < 0 and int(wallet.balance) + delta < 0:
        raise AppError("insufficient_coins", "Not enough coins.", 402)
    new_balance = int(wallet.balance) + delta
    try:
        async with session.begin_nested():
            wallet.balance = new_balance
            wallet.updated_at = datetime.now(UTC)
            session.add(
                CoinLedger(
                    user_id=user_id,
                    delta=delta,
                    balance_after=new_balance,
                    reason=reason,
                    ref_type=ref_type,
                    ref_id=ref_id,
                    idempotency_key=idempotency_key,
                )
            )
            await session.flush()
    except IntegrityError:
        await session.refresh(wallet)
        return LedgerResult(delta=0, balance=int(wallet.balance), created=False)
    return LedgerResult(delta=delta, balance=new_balance, created=True)


async def grant_welcome(session: AsyncSession, user_id: UUID) -> LedgerResult:
    return await apply_delta(
        session,
        user_id,
        WELCOME_GRANT,
        "welcome",
        f"welcome:{user_id}",
        ref_type="welcome",
        ref_id=str(user_id),
    )


def _granted(streak: UserStreak) -> set[int]:
    return {int(m) for m in (streak.milestones or [])}


async def wallet_view(
    session: AsyncSession,
    user_id: UUID,
    local_day: date | None = None,
    *,
    coins_earned: int = 0,
) -> dict:
    today = _today(local_day)
    wallet = await session.get(Wallet, user_id)
    streak = await session.get(UserStreak, user_id)
    day = await session.scalar(select(EconomyDay).where(EconomyDay.user_id == user_id, EconomyDay.day == today))
    count = int(streak.current_count) if streak else 0
    best = int(streak.best_count) if streak else 0
    freezes = int(streak.freezes) if streak else 0
    last = streak.last_active_date if streak else None
    granted = _granted(streak) if streak else set()
    claimed = bool(day.streak_claimed) if day else last == today
    if claimed:
        reward = daily_streak_coins(count)
    else:
        upcoming, _, _ = advance_streak(count, last, today, freezes)
        reward, _ = streak_payout(upcoming, granted)
    used_hints = int(day.free_hints_used) if day else 0
    return {
        "balance": int(wallet.balance) if wallet else 0,
        "streak": count,
        "bestStreak": best,
        "freezes": freezes,
        "freeHintsLeft": max(0, FREE_HINTS_PER_DAY - used_hints),
        "freeHintsPerDay": FREE_HINTS_PER_DAY,
        "freezeCost": FREEZE_COST,
        "todayReward": reward,
        "streakClaimed": claimed,
        "nextMilestone": next_milestone(count, granted),
        "gamesRewarded": int(day.games_rewarded) if day else 0,
        "gamesRewardCap": GAME_REWARD_CAP,
        "momentsRewarded": int(day.moments_rewarded) if day else 0,
        "momentsRewardCap": MOMENT_REWARD_CAP,
        "packs": pack_catalog(),
        "coinsEarned": coins_earned,
    }


async def claim_streak(
    session: AsyncSession,
    user_id: UUID,
    local_day: date | None,
    *,
    migrate_count: int | None = None,
    migrate_date: str | None = None,
) -> dict:
    today = _today(local_day)
    welcome = await grant_welcome(session, user_id)
    welcome_earned = welcome.delta if welcome.created else 0
    streak = await _ensure_streak(session, user_id)
    if streak.last_active_date is None and int(streak.current_count) == 0 and migrate_count and migrate_count > 0:
        copied = parse_migrate_date(migrate_date, today)
        if copied is not None:
            streak.current_count = migrate_count
            streak.best_count = max(int(streak.best_count), migrate_count)
            # Only a streak that is still alive keeps its milestone bonuses.
            # A gap resets the count below, and that new run can earn the bonuses again.
            alive = (
                copied == today
                or copied == today - timedelta(days=1)
                or (copied == today - timedelta(days=2) and int(streak.freezes) > 0)
            )
            if alive:
                streak.milestones = [day for day, _amount in MILESTONES if day <= migrate_count]
            if copied < today:
                streak.last_active_date = copied

    if streak.last_active_date == today:
        view = await wallet_view(session, user_id, today)
        # Welcome can land on the same request that finds the streak already claimed.
        view["coinsEarned"] = welcome_earned
        view["freezeUsed"] = False
        return view

    seeded_today = (
        streak.last_active_date is None
        and migrate_count is not None
        and migrate_count > 0
        and parse_migrate_date(migrate_date, today) == today
        and int(streak.current_count) == migrate_count
    )
    if seeded_today:
        new_count, freezes_after, used_freeze = int(streak.current_count), int(streak.freezes), False
    else:
        new_count, freezes_after, used_freeze = advance_streak(
            int(streak.current_count), streak.last_active_date, today, int(streak.freezes)
        )

    payout, newly = streak_payout(new_count, _granted(streak))
    streak.current_count = new_count
    streak.best_count = max(int(streak.best_count), new_count)
    streak.last_active_date = today
    streak.freezes = freezes_after
    streak.milestones = list(_granted(streak)) + newly
    streak.updated_at = datetime.now(UTC)
    day = await _ensure_day(session, user_id, today)
    day.streak_claimed = True
    result = await apply_delta(
        session,
        user_id,
        payout,
        "streak",
        f"streak:{user_id}:{today.isoformat()}",
        ref_type="streak",
        ref_id=today.isoformat(),
    )
    earned = welcome_earned + (result.delta if result.created else 0)
    view = await wallet_view(session, user_id, today, coins_earned=earned)
    if result.created:
        view["todayReward"] = payout
    view["freezeUsed"] = used_freeze
    return view


async def grant_game(session: AsyncSession, user_id: UUID, play_id: UUID, local_day: date | None) -> dict:
    today = _today(local_day)
    await grant_welcome(session, user_id)
    day = await _ensure_day(session, user_id, today)
    amount = game_grant_amount(int(day.games_rewarded))
    if amount <= 0:
        view = await wallet_view(session, user_id, today)
        return {"coinsEarned": 0, "balance": view["balance"]}
    result = await apply_delta(
        session,
        user_id,
        amount,
        "game_play",
        f"game:{play_id}",
        ref_type="game_play",
        ref_id=str(play_id),
    )
    if result.created:
        day.games_rewarded = int(day.games_rewarded) + 1
    return {"coinsEarned": result.delta if result.created else 0, "balance": result.balance}


async def lookup_game_reward(session: AsyncSession, user_id: UUID, play_id: UUID) -> dict:
    row = await _ledger(session, f"game:{play_id}")
    wallet = await session.get(Wallet, user_id)
    return {
        "coinsEarned": int(row.delta) if row is not None else 0,
        "balance": int(wallet.balance) if wallet is not None else 0,
    }


async def grant_moment(
    session: AsyncSession,
    user_id: UUID,
    response_id: UUID,
    local_day: date | None,
    *,
    correct: bool,
) -> dict:
    today = _today(local_day)
    await grant_welcome(session, user_id)
    day = await _ensure_day(session, user_id, today)
    amount = moment_grant_amount(int(day.moments_rewarded), correct)
    if amount <= 0:
        view = await wallet_view(session, user_id, today)
        return {"coinsEarned": 0, "balance": view["balance"]}
    result = await apply_delta(
        session,
        user_id,
        amount,
        "moment_response",
        f"moment:{response_id}",
        ref_type="response",
        ref_id=str(response_id),
    )
    if result.created:
        day.moments_rewarded = int(day.moments_rewarded) + 1
    return {"coinsEarned": result.delta if result.created else 0, "balance": result.balance}


async def lookup_moment_reward(session: AsyncSession, user_id: UUID, response_id: UUID) -> dict:
    row = await _ledger(session, f"moment:{response_id}")
    wallet = await session.get(Wallet, user_id)
    return {
        "coinsEarned": int(row.delta) if row is not None else 0,
        "balance": int(wallet.balance) if wallet is not None else 0,
    }


async def spend_hint(
    session: AsyncSession,
    user_id: UUID,
    *,
    engine: str,
    hint_id: str,
    idempotency_key: str,
    local_day: date | None,
) -> dict:
    if not idempotency_key:
        raise AppError("invalid", "Send an Idempotency-Key for this hint.", 422)
    cost = hint_cost(engine, hint_id)
    today = _today(local_day)
    await grant_welcome(session, user_id)
    existing = await _ledger(session, idempotency_key)
    if existing is not None:
        view = await wallet_view(session, user_id, today)
        view["free"] = existing.reason == "free_hint"
        view["coinsSpent"] = abs(int(existing.delta)) if int(existing.delta) < 0 else 0
        return view
    day = await _ensure_day(session, user_id, today)
    if int(day.free_hints_used) < FREE_HINTS_PER_DAY:
        result = await apply_delta(
            session,
            user_id,
            0,
            "free_hint",
            idempotency_key,
            ref_type="hint",
            ref_id=hint_id,
        )
        if result.created:
            day.free_hints_used = int(day.free_hints_used) + 1
        view = await wallet_view(session, user_id, today)
        view["free"] = True
        view["coinsSpent"] = 0
        return view
    await apply_delta(
        session,
        user_id,
        -cost,
        "hint",
        idempotency_key,
        ref_type="hint",
        ref_id=hint_id,
    )
    view = await wallet_view(session, user_id, today)
    view["free"] = False
    view["coinsSpent"] = cost
    return view


async def buy_freeze(
    session: AsyncSession,
    user_id: UUID,
    idempotency_key: str,
    local_day: date | None,
) -> dict:
    if not idempotency_key:
        raise AppError("invalid", "Send an Idempotency-Key for this freeze.", 422)
    today = _today(local_day)
    await grant_welcome(session, user_id)
    streak = await _ensure_streak(session, user_id)
    existing = await _ledger(session, idempotency_key)
    if existing is not None:
        return await wallet_view(session, user_id, today)
    if int(streak.freezes) >= 1:
        raise AppError("freeze_full", "You already have a streak freeze.", 409)
    await apply_delta(
        session,
        user_id,
        -FREEZE_COST,
        "streak_freeze",
        idempotency_key,
        ref_type="streak_freeze",
        ref_id=str(user_id),
    )
    streak.freezes = 1
    streak.updated_at = datetime.now(UTC)
    return await wallet_view(session, user_id, today)


async def credit_purchase(
    session: AsyncSession,
    user_id: UUID,
    *,
    store: str,
    store_transaction_id: str,
    product_id: str,
    local_day: date | None,
) -> dict:
    coins = pack_coins(product_id)
    if coins is None or not store_transaction_id:
        raise AppError("invalid", "Unknown coin pack.", 422)
    today = _today(local_day)
    await grant_welcome(session, user_id)
    existing = await session.scalar(
        select(IapPurchase).where(IapPurchase.store_transaction_id == store_transaction_id)
    )
    if existing is not None:
        if existing.user_id != user_id:
            raise AppError("conflict", "That purchase is already linked to another account.", 409)
        view = await wallet_view(session, user_id, today)
        view["coinsEarned"] = 0
        return view
    result = await apply_delta(
        session,
        user_id,
        coins,
        "iap",
        f"iap:{store_transaction_id}",
        ref_type="product",
        ref_id=product_id,
    )
    try:
        async with session.begin_nested():
            session.add(
                IapPurchase(
                    user_id=user_id,
                    store=store or "unknown",
                    store_transaction_id=store_transaction_id,
                    product_id=product_id,
                    coins=coins,
                )
            )
            await session.flush()
    except IntegrityError:
        pass
    return await wallet_view(session, user_id, today, coins_earned=result.delta if result.created else 0)
