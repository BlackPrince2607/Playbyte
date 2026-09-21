"""Seed category-question-pack.json into the API via admin CMS endpoints.

Usage:
  python scripts/seed_question_pack.py
  python scripts/seed_question_pack.py --api-url https://playbyte-production.up.railway.app --go-live
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PACK = ROOT / "docs" / "content" / "category-question-pack.json"


def req(method: str, url: str, *, headers: dict[str, str], body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=45) as res:
            raw = res.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        raise SystemExit(f"{method} {url} -> {exc.code}: {detail}") from exc


def normalize_options(options: list) -> list[str]:
    """Railway admin OpenAPI currently only accepts string options."""
    out: list[str] = []
    for opt in options:
        if isinstance(opt, str):
            out.append(opt)
        else:
            out.append(str(opt["label"]))
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed question pack via admin API")
    parser.add_argument("--api-url", default="https://playbyte-production.up.railway.app")
    parser.add_argument("--admin-key", default="dev-admin-key")
    parser.add_argument("--pack", type=Path, default=DEFAULT_PACK)
    parser.add_argument("--go-live", action="store_true", help="Transition draft → ready → live")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    pack = json.loads(args.pack.read_text(encoding="utf-8"))
    moments = pack.get("moments") or []
    base = args.api_url.rstrip("/")
    headers = {
        "Content-Type": "application/json",
        "X-Admin-Key": args.admin_key,
    }

    cats = req("GET", f"{base}/v1/categories", headers={"Accept": "application/json"})
    by_slug = {c["slug"]: c["id"] for c in cats.get("categories", [])}
    missing = sorted({m["categorySlug"] for m in moments} - set(by_slug))
    if missing:
        raise SystemExit(f"Missing categories on API: {', '.join(missing)}")

    # Fetch existing live prompts to skip duplicates
    existing = req("GET", f"{base}/v1/admin/moments", headers=headers)
    live_prompts = {
        (m.get("prompt") or "").strip()
        for m in existing.get("moments", [])
        if m.get("status") == "live"
    }

    starts = datetime.now(UTC)
    ends = starts + timedelta(days=30)
    created: list[dict] = []

    for m in moments:
        prompt = m["prompt"].strip()
        if prompt in live_prompts:
            print(f"SKIP (live) {m['categorySlug']}: {prompt[:60]}")
            continue

        # Deployed admin schema: options are strings only (no quiz isCorrect / tags yet)
        body = {
            "type": m["type"],
            "categoryId": by_slug[m["categorySlug"]],
            "prompt": prompt,
            "options": normalize_options(m["options"]),
            "restrictedTopic": m.get("restrictedTopic", "none"),
            "startsAt": starts.isoformat().replace("+00:00", "Z"),
            "endsAt": ends.isoformat().replace("+00:00", "Z"),
        }
        if args.dry_run:
            print(f"[dry-run] {m['categorySlug']}: {prompt}")
            continue

        created_row = req("POST", f"{base}/v1/admin/moments", headers=headers, body=body)
        mid = created_row["id"]
        status = created_row.get("status", "draft")

        if args.go_live:
            req(
                "POST",
                f"{base}/v1/admin/moments/{mid}/transition",
                headers=headers,
                body={"status": "ready"},
            )
            live = req(
                "POST",
                f"{base}/v1/admin/moments/{mid}/transition",
                headers=headers,
                body={"status": "live"},
            )
            status = live.get("status", "live")
            live_prompts.add(prompt)

        created.append({"id": mid, "status": status, "prompt": prompt, "category": m["categorySlug"]})
        print(f"OK [{status}] {m['categorySlug']}: {prompt[:60]}")

    print(f"\nSeeded {len(created)} moments (go_live={args.go_live})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
