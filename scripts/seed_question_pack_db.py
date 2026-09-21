"""Seed docs/content/category-question-pack.json directly into Postgres (same DB as Railway).

Uses DATABASE_URL from env / .env. Creates moments as live with a 30-day window.

  cd D:\\Play
  python scripts/seed_question_pack_db.py
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

DEFAULT_PACK = ROOT / "docs" / "content" / "category-question-pack.json"


def load_dotenv() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        os.environ.setdefault(key, val)


def async_url(url: str) -> str:
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgres://") and "+asyncpg" not in url:
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


def normalize_options(options: list) -> list[dict]:
    out: list[dict] = []
    for i, opt in enumerate(options):
        if isinstance(opt, str):
            out.append({"label": opt, "isCorrect": False, "sortOrder": i})
        else:
            out.append(
                {
                    "label": opt["label"],
                    "isCorrect": bool(opt.get("isCorrect", False)),
                    "sortOrder": i,
                }
            )
    return out


async def seed(pack_path: Path, *, go_live: bool, dry_run: bool) -> int:
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.infrastructure.postgres.models import (
        Category,
        ContentTag,
        CrowdSnapshot,
        Moment,
        MomentOption,
        MomentTag,
    )

    pack = json.loads(pack_path.read_text(encoding="utf-8"))
    moments = pack.get("moments") or []
    db = os.environ.get("DATABASE_URL")
    if not db:
        raise SystemExit("DATABASE_URL is required")

    engine = create_async_engine(async_url(db))
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    starts = datetime.now(UTC)
    ends = starts + timedelta(days=30)
    inserted = 0

    async with Session() as session:
        cats = {c.slug: c for c in await session.scalars(select(Category))}
        tags = {t.slug: t for t in await session.scalars(select(ContentTag))}
        missing_cats = sorted({m["categorySlug"] for m in moments} - set(cats))
        if missing_cats:
            raise SystemExit(f"Missing categories: {', '.join(missing_cats)}")

        for m in moments:
            cat = cats[m["categorySlug"]]
            opts = normalize_options(m["options"])
            tag_slugs = list(m.get("tags") or ["poll"])
            scoring = m.get("scoringMode") or "none"
            if "quiz" in tag_slugs:
                scoring = "correct_option"

            # CMS rules
            if m["type"] == "predict" and len(opts) != 2:
                raise SystemExit(f"Predict needs 2 options: {m['prompt']}")
            if m["type"] == "reaction" and len(opts) != 2:
                raise SystemExit(f"Reaction needs 2 options: {m['prompt']}")
            if m["type"] == "pulse" and not (2 <= len(opts) <= 4):
                raise SystemExit(f"Pulse needs 2–4 options: {m['prompt']}")
            if scoring == "correct_option":
                if sum(1 for o in opts if o["isCorrect"]) != 1:
                    raise SystemExit(f"Quiz needs one correct option: {m['prompt']}")

            if dry_run:
                print(f"[dry-run] {m['categorySlug']}: {m['prompt']}")
                continue

            # Skip exact duplicate live prompts already present
            existing = await session.scalar(
                select(Moment).where(Moment.prompt == m["prompt"], Moment.status == "live")
            )
            if existing:
                print(f"SKIP (already live) {m['categorySlug']}: {m['prompt'][:60]}")
                continue

            row = Moment(
                type=m["type"],
                category_id=cat.id,
                prompt=m["prompt"],
                scoring_mode=scoring,
                restricted_topic=m.get("restrictedTopic", "none"),
                status="live" if go_live else "draft",
                starts_at=starts,
                ends_at=ends,
            )
            session.add(row)
            await session.flush()
            for opt in opts:
                session.add(
                    MomentOption(
                        moment_id=row.id,
                        label=opt["label"],
                        is_correct=bool(opt["isCorrect"]),
                        sort_order=int(opt["sortOrder"]),
                    )
                )
            for slug in tag_slugs:
                tag = tags.get(slug)
                if tag:
                    session.add(MomentTag(moment_id=row.id, tag_id=tag.id))
            session.add(
                CrowdSnapshot(
                    moment_id=row.id,
                    version=1,
                    total_responses=0,
                    option_counts={},
                    joined_last_minute=0,
                    volume_state="nascent",
                )
            )
            inserted += 1
            print(f"OK [{'live' if go_live else 'draft'}] {m['categorySlug']}: {m['prompt'][:60]}")

        if not dry_run:
            await session.commit()

    await engine.dispose()
    print(f"\nInserted {inserted} moments")
    return inserted


def main() -> int:
    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("--pack", type=Path, default=DEFAULT_PACK)
    parser.add_argument("--draft-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    count = asyncio.run(seed(args.pack, go_live=not args.draft_only, dry_run=args.dry_run))
    return 0 if count >= 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
