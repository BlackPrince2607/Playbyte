"""One-shot helper to seed empty trend files. Not used by the refresh job."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from scripts.content_gen.taxonomy import ONBOARDING_SLUGS

ROOT = Path(__file__).resolve().parent


def main() -> None:
    stamp = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    for slug in ONBOARDING_SLUGS:
        path = ROOT / f"{slug}.json"
        if path.exists():
            continue
        payload = {"category": slug, "updatedAt": stamp, "trends": []}
        path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {path.name}")


if __name__ == "__main__":
    main()
