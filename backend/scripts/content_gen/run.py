"""Ask the OpenAI agent for category polls and quizzes and write a JSON report.

Publishing lives in scripts/refresh_feed_content.py. This command never inserts rows.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path

from scripts.content_gen.agent import MissingOpenAIKey, agent_candidates, fill_evergreen
from scripts.content_gen.catalog import ONBOARDING_SLUGS, event_cards


def _json_card(card) -> dict:
    row = asdict(card)
    ends = row.get("ends_at")
    row["ends_at"] = ends.isoformat() if ends else None
    return row


def collect(slugs: list[str], need: int) -> list:
    cards = []
    seen: set[str] = set()
    for slug in slugs:
        batch = fill_evergreen(slug, agent_candidates(slug, need), need)
        batch.extend(event_cards(slug))
        for card in batch:
            if card.prompt in seen:
                continue
            seen.add(card.prompt)
            cards.append(card)
    return cards


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate category polls and quizzes with the OpenAI agent")
    parser.add_argument("--count", type=int, default=8, help="Evergreen cards to request per category")
    parser.add_argument("--category", type=str, default="", help="One category slug; default is every onboarding category")
    parser.add_argument("--out", type=str, default="", help="Report JSON path")
    args = parser.parse_args(argv)

    slugs = [args.category] if args.category else list(ONBOARDING_SLUGS)
    unknown = [slug for slug in slugs if slug not in ONBOARDING_SLUGS]
    if unknown:
        print(f"Unknown category: {', '.join(unknown)}")
        return 1

    try:
        cards = collect(slugs, args.count)
    except MissingOpenAIKey as exc:
        print(str(exc))
        return 1

    report = {
        "generatedAt": datetime.now(UTC).isoformat(),
        "count": len(cards),
        "categories": slugs,
        "moments": [_json_card(card) for card in cards],
    }
    out_path = args.out or f"content_gen_report_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}.json"
    Path(out_path).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote {out_path} ({len(cards)} cards)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
