"""End-to-end async challenge duel against the live DATABASE_URL.

Creates two temporary users + friendship, runs create → accept → dual plays →
completed compare, then deletes the rows it created.
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from pathlib import Path

from dotenv import dotenv_values
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

# Load .env without overriding an already-set DATABASE_URL.
for k, v in dotenv_values(ROOT / ".env").items():
    if v is not None and k not in os.environ:
        os.environ[k] = v

from app.common.auth import Actor  # noqa: E402
from app.common.errors import AppError  # noqa: E402
from app.infrastructure.postgres.models import (  # noqa: E402
    Challenge,
    Friendship,
    GamePlay,
    MiniGame,
    Profile,
    User,
)
from app.modules.challenges.service import (  # noqa: E402
    accept_challenge,
    create_challenge,
    decline_challenge,
    get_challenge,
    list_challenges,
    serialize_challenge,
)
from app.modules.games.service import submit_play  # noqa: E402


def _async_url(raw: str) -> str:
    if raw.startswith("postgresql://"):
        return raw.replace("postgresql://", "postgresql+asyncpg://", 1)
    return raw


async def _cleanup(session: AsyncSession, user_ids: list[uuid.UUID], challenge_ids: list[uuid.UUID]) -> None:
    if not user_ids and not challenge_ids:
        return
    for cid in challenge_ids:
        await session.execute(
            text(
                "UPDATE challenges SET challenger_play_id = NULL, opponent_play_id = NULL WHERE id = CAST(:id AS uuid)"
            ),
            {"id": str(cid)},
        )
        await session.execute(
            text("UPDATE game_plays SET challenge_id = NULL WHERE challenge_id = CAST(:id AS uuid)"),
            {"id": str(cid)},
        )
        await session.execute(
            text("DELETE FROM challenges WHERE id = CAST(:id AS uuid)"),
            {"id": str(cid)},
        )
    for uid in user_ids:
        uid_s = str(uid)
        await session.execute(
            text("DELETE FROM coin_ledger WHERE user_id = CAST(:id AS uuid)"),
            {"id": uid_s},
        )
        await session.execute(
            text("DELETE FROM economy_days WHERE user_id = CAST(:id AS uuid)"),
            {"id": uid_s},
        )
        await session.execute(
            text("DELETE FROM wallets WHERE user_id = CAST(:id AS uuid)"),
            {"id": uid_s},
        )
        await session.execute(
            text("DELETE FROM user_daily_stats WHERE user_id = CAST(:id AS uuid)"),
            {"id": uid_s},
        )
        await session.execute(
            text("DELETE FROM game_plays WHERE user_id = CAST(:id AS uuid)"),
            {"id": uid_s},
        )
        await session.execute(
            text(
                "DELETE FROM friendships WHERE user_a = CAST(:id AS uuid) OR user_b = CAST(:id AS uuid)"
            ),
            {"id": uid_s},
        )
        await session.execute(
            text("DELETE FROM profiles WHERE user_id = CAST(:id AS uuid)"),
            {"id": uid_s},
        )
        await session.execute(
            text("DELETE FROM users WHERE id = CAST(:id AS uuid)"),
            {"id": uid_s},
        )
    await session.commit()


async def main() -> int:
    raw = os.environ.get("DATABASE_URL", "")
    if not raw:
        print("FAIL: DATABASE_URL missing")
        return 1

    engine = create_async_engine(_async_url(raw), pool_pre_ping=True)
    Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    tag = uuid.uuid4().hex[:8]
    user_ids: list[uuid.UUID] = []
    challenge_ids: list[uuid.UUID] = []

    try:
        async with Session() as session:
            # Schema smoke check
            await session.execute(text("SELECT 1 FROM challenges LIMIT 1"))
            game = await session.scalar(select(MiniGame).where(MiniGame.status == "enabled").limit(1))
            if game is None:
                print("FAIL: no enabled mini_games")
                return 1
            game_key = game.key
            print(f"ok schema challenges; game={game_key}")

            ada = User(auth_subject=f"e2e-chal-ada-{tag}", status="active")
            bo = User(auth_subject=f"e2e-chal-bo-{tag}", status="active")
            session.add_all([ada, bo])
            await session.flush()
            session.add_all(
                [
                    Profile(user_id=ada.id, display_name=f"Ada-{tag}"),
                    Profile(user_id=bo.id, display_name=f"Bo-{tag}"),
                ]
            )
            lo, hi = sorted([ada.id, bo.id])
            session.add(Friendship(user_a=lo, user_b=hi, status="accepted", requested_by=ada.id))
            await session.commit()
            user_ids = [ada.id, bo.id]
            print(f"ok users friends ada={ada.id} bo={bo.id}")

        # Non-friend refuse
        async with Session() as session:
            stranger = User(auth_subject=f"e2e-chal-x-{tag}", status="active")
            session.add(stranger)
            await session.flush()
            session.add(Profile(user_id=stranger.id, display_name="Stranger"))
            await session.commit()
            user_ids.append(stranger.id)
            try:
                await create_challenge(
                    session, user_ids[0], stranger.id, game_key, idempotency_key=f"nf-{tag}"
                )
                print("FAIL: expected non-friend create to fail")
                return 1
            except AppError as e:
                assert e.status_code == 403
                print("ok refuse non-friend")

        # Create challenge
        async with Session() as session:
            chal = await create_challenge(
                session,
                user_ids[0],
                user_ids[1],
                game_key,
                seed="e2e-seed-42",
                idempotency_key=f"create-{tag}",
            )
            await session.commit()
            challenge_ids.append(chal.id)
            assert chal.status == "pending"
            assert chal.seed == "e2e-seed-42"
            print(f"ok create pending id={chal.id} seed={chal.seed}")

            again = await create_challenge(
                session,
                user_ids[0],
                user_ids[1],
                game_key,
                seed="ignored",
                idempotency_key=f"create-{tag}",
            )
            assert again.id == chal.id
            print("ok create idempotent")

        # Decline then recreate path: accept instead
        async with Session() as session:
            # Separate challenge for decline
            declined = await create_challenge(
                session,
                user_ids[0],
                user_ids[1],
                game_key,
                idempotency_key=f"decline-{tag}",
            )
            await session.commit()
            challenge_ids.append(declined.id)
            out = await decline_challenge(session, declined.id, user_ids[1])
            await session.commit()
            assert out.status == "declined"
            print("ok decline")

        # Accept + both plays → completed
        async with Session() as session:
            chal = await get_challenge(session, challenge_ids[0], user_ids[1])
            accepted = await accept_challenge(session, chal.id, user_ids[1])
            await session.commit()
            assert accepted.status == "active"
            print("ok accept → active")

        async with Session() as session:
            a_actor = Actor(kind="user", user_id=user_ids[0])
            b_actor = Actor(kind="user", user_id=user_ids[1])
            a_play = await submit_play(
                session,
                a_actor,
                game_key,
                score=80,
                duration_ms=4000,
                idempotency_key=f"play-a-{tag}",
                meta={"engine": "guess", "seed": "e2e-seed-42"},
                challenge_id=challenge_ids[0],
            )
            await session.commit()
            assert a_play["created"] is True
            assert a_play["challenge"]["status"] in ("active", "completed")
            assert a_play["challenge"]["myScore"] == 80
            print(f"ok challenger play status={a_play['challenge']['status']}")

            b_play = await submit_play(
                session,
                b_actor,
                game_key,
                score=65,
                duration_ms=4500,
                idempotency_key=f"play-b-{tag}",
                meta={"engine": "guess", "seed": "e2e-seed-42"},
                challenge_id=challenge_ids[0],
            )
            await session.commit()
            assert b_play["challenge"]["status"] == "completed"
            assert b_play["challenge"]["myScore"] == 65
            assert b_play["challenge"]["theirScore"] == 80
            print(
                f"ok opponent play completed you={b_play['challenge']['myScore']} "
                f"them={b_play['challenge']['theirScore']}"
            )

        # Post-game attach via playId on create
        async with Session() as session:
            actor = Actor(kind="user", user_id=user_ids[0])
            prior = await submit_play(
                session,
                actor,
                game_key,
                score=99,
                duration_ms=3000,
                idempotency_key=f"prior-{tag}",
                meta={"engine": "guess", "seed": "prior-seed"},
            )
            await session.commit()
            play_id = uuid.UUID(prior["playId"])
            chal2 = await create_challenge(
                session,
                user_ids[0],
                user_ids[1],
                game_key,
                play_id=play_id,
                idempotency_key=f"attach-{tag}",
            )
            await session.commit()
            challenge_ids.append(chal2.id)
            assert chal2.challenger_play_id == play_id
            assert chal2.seed == "prior-seed"
            print("ok create-with-playId attaches score + seed")

            # Opponent play finishes it
            await accept_challenge(session, chal2.id, user_ids[1])
            await session.commit()
            b = await submit_play(
                session,
                Actor(kind="user", user_id=user_ids[1]),
                game_key,
                score=50,
                duration_ms=3000,
                idempotency_key=f"prior-b-{tag}",
                meta={"engine": "guess", "seed": "prior-seed"},
                challenge_id=chal2.id,
            )
            await session.commit()
            assert b["challenge"]["status"] == "completed"
            print("ok attach-play path completed")

        async with Session() as session:
            listed = await list_challenges(session, user_ids[0])
            assert any(c.id == challenge_ids[0] for c in listed)
            detail = await serialize_challenge(
                session,
                await get_challenge(session, challenge_ids[0], user_ids[0]),
                viewer_id=user_ids[0],
            )
            assert detail["status"] == "completed"
            assert detail["myScore"] == 80
            assert detail["theirScore"] == 65
            print(f"ok list+get vs {detail['myScore']}-{detail['theirScore']}")

        print("PASS e2e challenges")
        return 0
    except Exception as e:
        print(f"FAIL: {type(e).__name__}: {e}")
        raise
    finally:
        async with Session() as session:
            await _cleanup(session, user_ids, challenge_ids)
            print("ok cleanup")
        await engine.dispose()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
