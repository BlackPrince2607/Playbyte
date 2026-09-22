"""High-CTR daily content generation for PLAY moments (drafts for editorial review)."""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

# Allow running as `python -m scripts.content_gen.run` from backend/
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Live API category slugs only (see docs/content/QUESTION_LIBRARIES.md).
CATEGORIES = [
    "sports",
    "cricket",
    "news",
    "pop-culture",
    "food",
    "weather",
    "tech",
    "music",
    "movies",
    "social",
    "casual",
]

CTR_HOOKS = [
    "Most people get this wrong —",
    "Would you survive this take?",
    "Only 1 in 5 pick correctly:",
    "Hot take check:",
    "Be honest —",
    "India is split on this:",
    "Quick: which one wins?",
    "Your friends will roast you for this:",
    "No wrong answer (except theirs) —",
    "Group chat is fighting about this:",
]

POLL_TEMPLATES = [
    ("{hook} {a} or {b}?", ["{a}", "{b}"]),
    ("{hook} What's the move for {topic}?", ["Go big", "Play safe", "Skip it", "Ask a friend"]),
    ("{hook} Pick the vibe for {topic}.", ["Chaotic", "Chill", "Main character", "Lowkey"]),
    ("{hook} Honest take on {topic}?", ["Love it", "Hate it", "It's complicated", "No opinion"]),
]

QUIZ_TEMPLATES = [
    ("{hook} Which is true about {topic}?", ["{a}", "{b}", "{c}", "{d}"]),
    ("{hook} Best answer for {topic}?", ["{a}", "{b}", "{c}"]),
]

TOPIC_BANK = {
    "sports": ["IPL final", "Olympics", "football derby", "fantasy squad picks", "injury drama"],
    "cricket": ["powerplay", "death overs", "captaincy", "World Cup", "DRS reviews", "toss luck"],
    "news": ["morning headlines", "fact-check habit", "breaking alerts", "longform vs shorts"],
    "pop-culture": ["meme of the week", "viral audio", "influencer drama", "fandom wars", "reel trends"],
    "food": ["street food", "late-night cravings", "diet trends", "chai vs coffee", "biryani loyalty"],
    "weather": ["monsoon commute", "AC season", "unexpected rain", "winter mornings"],
    "tech": ["phone launch", "privacy settings", "startup hype", "app wars", "AI at work"],
    "music": ["chart battle", "concert tickets", "collab drop", "playlist wars", "earworms"],
    "movies": ["sequel bait", "interval twist", "cast rumor", "weekend release", "theatre vs OTT"],
    "social": ["group plans", "seen-zone etiquette", "birthday wishes", "drama threads"],
    "casual": ["Sunday reset", "Monday doom", "snooze culture", "free evening chaos"],
}

PAIR_BANK = [
    ("Chai", "Coffee"),
    ("Night owl", "Early bird"),
    ("Movies", "Series"),
    ("Cricket", "Football"),
    ("City", "Hometown"),
    ("Save money", "Spend joy"),
    ("Theatre", "OTT"),
    ("Mute chat", "Join chaos"),
    ("Cook", "Order in"),
    ("iOS", "Android"),
]


@dataclass
class GeneratedMoment:
    type: str
    categorySlug: str
    prompt: str
    options: list[dict[str, Any]]
    tags: list[str]
    scoringMode: str
    restrictedTopic: str
    status: str = "draft"


def _pick_pair() -> tuple[str, str]:
    return random.choice(PAIR_BANK)


def generate_one(tag: str, category: str | None = None) -> GeneratedMoment:
    cat = category or random.choice(CATEGORIES)
    topic = random.choice(TOPIC_BANK.get(cat, ["today"]))
    hook = random.choice(CTR_HOOKS)
    a, b = _pick_pair()
    c, d = _pick_pair()

    if tag == "quiz":
        tmpl, opts_tmpl = random.choice(QUIZ_TEMPLATES)
        prompt = tmpl.format(hook=hook, topic=topic, a=a, b=b, c=c, d=d)
        options = [o.format(a=a, b=b, c=c, d=d, topic=topic) for o in opts_tmpl]
        correct = random.randrange(len(options))
        return GeneratedMoment(
            type="pulse",
            categorySlug=cat,
            prompt=prompt,
            options=[{"label": o, "isCorrect": i == correct} for i, o in enumerate(options)],
            tags=["quiz"],
            scoringMode="correct_option",
            restrictedTopic="none",
        )

    tmpl, opts_tmpl = random.choice(POLL_TEMPLATES)
    prompt = tmpl.format(hook=hook, topic=topic, a=a, b=b)
    options = [o.format(a=a, b=b, topic=topic) for o in opts_tmpl]
    moment_type = "predict" if len(options) == 2 else "pulse"
    return GeneratedMoment(
        type=moment_type,
        categorySlug=cat,
        prompt=prompt,
        options=[{"label": o, "isCorrect": False} for o in options],
        tags=["poll"],
        scoringMode="none",
        restrictedTopic="none",
    )


def generate_batch(count: int, tags: list[str]) -> list[GeneratedMoment]:
    out: list[GeneratedMoment] = []
    cats = CATEGORIES.copy()
    random.shuffle(cats)
    for i in range(count):
        tag = tags[i % len(tags)]
        cat = cats[i % len(cats)]
        out.append(generate_one(tag, cat))
    return out


def try_llm_enrich(moments: list[GeneratedMoment]) -> list[GeneratedMoment]:
    """Optional OpenAI polish when OPENAI_API_KEY is set; otherwise return templates unchanged."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return moments
    try:
        import urllib.request

        sample = moments[:5]
        body = {
            "model": os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
            "messages": [
                {
                    "role": "system",
                    "content": "Rewrite quiz/poll prompts for high CTR, vernacular Indian internet tone. Keep meaning. Return JSON array of strings same length.",
                },
                {
                    "role": "user",
                    "content": json.dumps([m.prompt for m in sample]),
                },
            ],
            "temperature": 0.8,
        }
        req = urllib.request.Request(
            "https://api.openai.com/v1/chat/completions",
            data=json.dumps(body).encode(),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as res:
            payload = json.loads(res.read().decode())
        content = payload["choices"][0]["message"]["content"]
        rewritten = json.loads(content)
        if isinstance(rewritten, list) and len(rewritten) == len(sample):
            for m, text in zip(sample, rewritten):
                m.prompt = str(text)
    except Exception:
        pass
    return moments


async def insert_drafts(moments: list[GeneratedMoment], database_url: str) -> list[str]:
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.infrastructure.postgres.models import Category, ContentTag, Moment, MomentOption, MomentTag

    url = database_url
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

    engine = create_async_engine(url)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    ids: list[str] = []
    async with Session() as session:
        cats = {c.slug: c for c in await session.scalars(select(Category))}
        tags = {t.slug: t for t in await session.scalars(select(ContentTag))}
        for m in moments:
            cat = cats.get(m.categorySlug)
            if not cat:
                continue
            row = Moment(
                type=m.type,
                category_id=cat.id,
                prompt=m.prompt,
                scoring_mode=m.scoringMode,
                restricted_topic=m.restrictedTopic,
                status="draft",
            )
            session.add(row)
            await session.flush()
            for i, opt in enumerate(m.options):
                session.add(
                    MomentOption(
                        moment_id=row.id,
                        label=opt["label"],
                        is_correct=bool(opt.get("isCorrect")),
                        sort_order=i,
                    )
                )
            for slug in m.tags:
                tag = tags.get(slug)
                if tag:
                    session.add(MomentTag(moment_id=row.id, tag_id=tag.id))
            ids.append(str(row.id))
        await session.commit()
    await engine.dispose()
    return ids


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate high-CTR draft quizzes/polls for PLAY")
    parser.add_argument("--count", type=int, default=50)
    parser.add_argument("--tags", type=str, default="poll,quiz", help="Comma-separated: poll,quiz")
    parser.add_argument("--dry-run", action="store_true", help="Print JSON only; do not insert")
    parser.add_argument("--out", type=str, default="", help="Write report JSON path")
    args = parser.parse_args(argv)

    tags = [t.strip() for t in args.tags.split(",") if t.strip()]
    if not tags:
        tags = ["poll", "quiz"]

    moments = generate_batch(args.count, tags)
    moments = try_llm_enrich(moments)
    report = {
        "generatedAt": datetime.now(UTC).isoformat(),
        "count": len(moments),
        "tags": tags,
        "moments": [asdict(m) for m in moments],
        "insertedIds": [],
    }

    if not args.dry_run:
        db = os.environ.get("DATABASE_URL", "postgresql+asyncpg://playbyte:playbyte@localhost:5432/playbyte")
        try:
            import asyncio

            report["insertedIds"] = asyncio.run(insert_drafts(moments, db))
        except Exception as exc:
            report["insertError"] = str(exc)
            print(json.dumps(report, indent=2))
            return 1

    out_path = args.out or f"content_gen_report_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}.json"
    Path(out_path).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote {out_path} ({len(moments)} moments, dry_run={args.dry_run})")
    if report.get("insertedIds"):
        print(f"Inserted {len(report['insertedIds'])} drafts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
