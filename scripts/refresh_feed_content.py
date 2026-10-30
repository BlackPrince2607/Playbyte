"""Publish a fresh agent batch via the admin API, then retire the previous live feed.

Every successful run fills the feed with India-trend polls/quizzes (engagement-aware),
gives them a short endsAt window, and retires all prior live moments so nothing repeats.

Usage:
  python scripts/refresh_feed_content.py --dry-run
  python scripts/refresh_feed_content.py --api-url https://majaa-production.up.railway.app --per-category 20
  python scripts/refresh_feed_content.py --no-images
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import random
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

MEME_PACK = ROOT / "docs" / "content" / "meme-image-pack.json"

def _onboarding_slugs() -> tuple[str, ...]:
    from scripts.content_gen.catalog import ONBOARDING_SLUGS

    return ONBOARDING_SLUGS


LIVE_CATEGORIES = set(_onboarding_slugs())


def req(method: str, url: str, *, headers: dict[str, str], body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=60) as res:
            raw = res.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        raise RuntimeError(f"{method} {url} -> {exc.code}: {detail}") from exc


def download_bytes(url: str) -> tuple[bytes, str]:
    request = urllib.request.Request(url, headers={"User-Agent": "maja-refresh/1.0"})
    with urllib.request.urlopen(request, timeout=45) as res:
        data = res.read()
        content_type = (res.headers.get("Content-Type") or "image/png").split(";")[0].strip()
        return data, content_type


def memegen_url(template: str, lines: list[str]) -> str:
    """Build a memegen.link image URL from template + caption lines."""
    parts = [urllib.parse.quote(str(line).replace(" ", "_") or "_", safe="_-") for line in (lines or ["_"])]
    while len(parts) < 1:
        parts.append("_")
    path = "/".join(parts)
    return f"https://api.memegen.link/images/{urllib.parse.quote(template, safe='')}/{path}.png"


def normalize_options_for_api(options: list[Any]) -> list[Any]:
    """Admin create accepts strings or {label,labelHi,imageKey,isCorrect} objects."""
    out: list[Any] = []
    for opt in options:
        if isinstance(opt, str):
            out.append(opt)
        else:
            row: dict[str, Any] = {"label": opt.get("label") or opt.get("text") or ""}
            if opt.get("labelHi") or opt.get("label_hi"):
                row["labelHi"] = opt.get("labelHi") or opt.get("label_hi")
            if opt.get("imageKey"):
                row["imageKey"] = opt["imageKey"]
            if opt.get("isCorrect"):
                row["isCorrect"] = True
            out.append(row)
    return out


def resolve_image_ref(ref: dict[str, Any] | None) -> tuple[bytes, str] | None:
    if not ref or ref.get("source") != "memegen":
        return None
    template = str(ref.get("template") or "").strip()
    if not template:
        return None
    lines = list(ref.get("lines") or ["_"])
    url = memegen_url(template, lines)
    try:
        data, content_type = download_bytes(url)
    except Exception as exc:  # noqa: BLE001 — skip broken meme templates
        print(f"WARN memegen fetch failed ({template}): {exc}")
        return None
    if content_type not in {"image/png", "image/jpeg", "image/webp"}:
        content_type = "image/png"
    return data, content_type


def upload_media(
    *,
    api_url: str,
    headers: dict[str, str],
    data: bytes,
    content_type: str,
    key_hint: str,
    dry_run: bool,
) -> str | None:
    if dry_run:
        return f"dry-run/{key_hint}"
    body = {
        "contentType": content_type,
        "base64": base64.b64encode(data).decode(),
        "key": key_hint,
    }
    try:
        res = req("POST", f"{api_url}/v1/admin/media", headers=headers, body=body)
        return res.get("key")
    except Exception as exc:  # noqa: BLE001
        print(f"WARN media upload failed ({key_hint}): {exc}")
        return None


def hydrate_images(
    moment: dict[str, Any],
    *,
    api_url: str,
    headers: dict[str, str],
    dry_run: bool,
    stamp: str,
) -> dict[str, Any] | None:
    """Resolve memegen refs → upload → rewrite keys. Returns None if required images fail."""
    out = dict(moment)
    slug = moment.get("categorySlug", "misc")
    prompt_ref = moment.get("promptImage")
    if prompt_ref:
        resolved = resolve_image_ref(prompt_ref)
        if not resolved:
            return None
        data, ctype = resolved
        key = upload_media(
            api_url=api_url,
            headers=headers,
            data=data,
            content_type=ctype,
            key_hint=f"prompts/{stamp}/{slug}-prompt-{random.randrange(1_000_000)}.png",
            dry_run=dry_run,
        )
        if not key:
            return None
        out["promptImageKey"] = key

    new_opts: list[Any] = []
    for i, opt in enumerate(moment.get("options") or []):
        if isinstance(opt, str):
            new_opts.append(opt)
            continue
        row = dict(opt)
        img_ref = row.pop("image", None)
        if img_ref:
            resolved = resolve_image_ref(img_ref)
            if not resolved:
                return None
            data, ctype = resolved
            key = upload_media(
                api_url=api_url,
                headers=headers,
                data=data,
                content_type=ctype,
                key_hint=f"prompts/{stamp}/{slug}-opt{i}-{random.randrange(1_000_000)}.png",
                dry_run=dry_run,
            )
            if not key:
                return None
            row["imageKey"] = key
            if not (row.get("label") or "").strip():
                row["label"] = f"Option {i + 1}"
        new_opts.append(row)
    out["options"] = new_opts
    out.pop("promptImage", None)
    return out


def list_live(*, api_url: str, headers: dict[str, str]) -> list[dict[str, Any]]:
    existing = req("GET", f"{api_url}/v1/admin/moments", headers=headers)
    return [m for m in existing.get("moments", []) if m.get("status") == "live"]


def fetch_insights(*, api_url: str, headers: dict[str, str]) -> dict[str, Any]:
    """Pull engagement rollups so the agent can lean into hits and drop duds."""
    try:
        return req("GET", f"{api_url}/v1/admin/moments/insights?limit=300", headers=headers)
    except Exception as exc:  # noqa: BLE001 — refresh still works without learning signals
        print(f"WARN insights unavailable: {exc}")
        return {}


def retire_moments(live: list[dict[str, Any]], *, api_url: str, headers: dict[str, str], dry_run: bool) -> int:
    retired = 0
    for m in live:
        mid = m["id"]
        if dry_run:
            print(f"[dry-run] retire {mid}: {(m.get('prompt') or '')[:50]}")
            retired += 1
            continue
        try:
            req(
                "POST",
                f"{api_url}/v1/admin/moments/{mid}/transition",
                headers=headers,
                body={"status": "closed"},
            )
            req(
                "POST",
                f"{api_url}/v1/admin/moments/{mid}/transition",
                headers=headers,
                body={"status": "retired"},
            )
            retired += 1
            print(f"RETIRED {mid}: {(m.get('prompt') or '')[:50]}")
        except Exception as exc:  # noqa: BLE001
            print(f"WARN retire failed {mid}: {exc}")
    return retired


def publish_moment(
    *,
    api_url: str,
    headers: dict[str, str],
    category_id: str,
    moment: dict[str, Any],
    starts: datetime,
    ends: datetime,
    dry_run: bool,
) -> bool:
    prompt = str(moment["prompt"]).strip()
    body: dict[str, Any] = {
        "type": moment["type"],
        "categoryId": category_id,
        "prompt": prompt,
        "options": normalize_options_for_api(moment.get("options") or []),
        "restrictedTopic": "none",
        "startsAt": starts.isoformat().replace("+00:00", "Z"),
        "scoringMode": moment.get("scoringMode") or "none",
        "tags": list(moment.get("tags") or ["poll"]),
    }
    prompt_hi = moment.get("promptHi") or moment.get("prompt_hi")
    if prompt_hi:
        body["promptHi"] = str(prompt_hi).strip()
    if "endsAt" in moment:
        body["endsAt"] = moment["endsAt"]
    else:
        body["endsAt"] = ends.isoformat().replace("+00:00", "Z")
    if moment.get("promptImageKey"):
        body["promptImageKey"] = moment["promptImageKey"]

    if dry_run:
        print(f"[dry-run] {moment['categorySlug']}: {prompt[:70]}")
        return True

    try:
        created = req("POST", f"{api_url}/v1/admin/moments", headers=headers, body=body)
        mid = created["id"]
        req(
            "POST",
            f"{api_url}/v1/admin/moments/{mid}/transition",
            headers=headers,
            body={"status": "ready"},
        )
        live = req(
            "POST",
            f"{api_url}/v1/admin/moments/{mid}/transition",
            headers=headers,
            body={"status": "live"},
        )
        print(f"OK [{live.get('status', 'live')}] {moment['categorySlug']}: {prompt[:60]}")
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL {moment['categorySlug']}: {prompt[:50]} -> {exc}")
        return False


def build_batch(count: int, *, include_images: bool) -> list[dict[str, Any]]:
    pack: list[dict[str, Any]] = []
    if include_images and MEME_PACK.exists():
        meme = json.loads(MEME_PACK.read_text(encoding="utf-8"))
        pack = [m for m in (meme.get("moments") or []) if m.get("categorySlug") in LIVE_CATEGORIES]
    random.shuffle(pack)
    combined = pack
    # Prefer unique prompts; keep order after shuffle.
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for m in combined:
        prompt = str(m.get("prompt") or "").strip()
        if not prompt or prompt in seen:
            continue
        seen.add(prompt)
        unique.append(m)
        if len(unique) >= count:
            break
    return unique


def plan_agent_batch(
    previous: list[dict[str, Any]],
    *,
    per_category: int,
    window_ends: datetime,
    window_hours: float,
    insights: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Fresh agent cards for every category (plus event briefs). Avoids all prior live prompts."""
    from scripts.content_gen.agent import agent_candidates, fill_evergreen, localize_hi
    from scripts.content_gen.catalog import MIN_LIVE, ONBOARDING_SLUGS, event_cards, has_devanagari

    need = max(per_category, MIN_LIVE)
    freshness_hours = max(1, int(round(window_hours)))
    by_category = (insights or {}).get("byCategory") or {}
    # Never re-show anything currently live, plus recent prompts from insights.
    seen: set[str] = {str(moment.get("prompt") or "").strip() for moment in previous}
    for row in (insights or {}).get("moments") or []:
        prompt = str(row.get("prompt") or "").strip()
        if prompt:
            seen.add(prompt)
    seen.discard("")
    avoid = list(seen)

    now = datetime.now(UTC)
    planned: list[dict[str, Any]] = []
    for slug in ONBOARDING_SLUGS:
        cat_insights = by_category.get(slug) or {}
        for extra in cat_insights.get("avoidPrompts") or []:
            text = str(extra).strip()
            if text and text not in seen:
                seen.add(text)
                avoid.append(text)
        print(f"AGENT {slug}: requesting {need} cards…")
        proposed = agent_candidates(
            slug,
            need,
            avoid_prompts=avoid,
            insights=cat_insights,
            freshness_hours=freshness_hours,
        )
        # Prefer model cards; evergreen is a last-resort top-up only.
        proposed = fill_evergreen(slug, proposed, need)
        proposed.extend(event_cards(slug, now=now))
        proposed = localize_hi(proposed)
        # Only publish cards with clean English fields + complete Devanagari Hindi fields.
        complete = []
        for card in proposed:
            en_clean = not has_devanagari(card.prompt) and all(
                not has_devanagari(str(opt.get("label") or "")) for opt in card.options
            )
            if en_clean and card.has_complete_hi():
                complete.append(card)
        if len(complete) < len(proposed):
            print(f"WARN {slug}: dropped {len(proposed) - len(complete)} cards missing clean EN/HI split")
        proposed = complete
        added = 0
        for card in proposed:
            if card.prompt in seen:
                continue
            is_event = bool(card.brief_id)
            if not is_event and added >= need:
                continue
            ends = card.ends_at or window_ends
            row: dict[str, Any] = {
                "categorySlug": card.category_slug,
                "type": card.type,
                "tags": list(card.tags),
                "scoringMode": card.scoring_mode,
                "prompt": card.prompt,
                "options": card.options,
                "endsAt": ends.isoformat().replace("+00:00", "Z"),
            }
            if card.prompt_hi:
                row["promptHi"] = card.prompt_hi
            planned.append(row)
            seen.add(card.prompt)
            avoid.append(card.prompt)
            if not is_event:
                added += 1
        print(f"AGENT {slug}: kept {added} (+events) of {len(proposed)} proposed")
    return planned


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish a fresh feed batch, then retire the previous live feed")
    parser.add_argument("--api-url", default="https://majaa-production.up.railway.app")
    parser.add_argument("--admin-key", default="dev-admin-key")
    parser.add_argument("--count", type=int, default=12, help="Optional meme/image moments (agent fills the feed)")
    parser.add_argument("--per-category", type=int, default=20, help="Fresh agent cards per category (fills the live feed)")
    parser.add_argument("--window-hours", type=float, default=4.0, help="Card TTL; match refresh cadence so the feed expires")
    parser.add_argument("--include-images", dest="include_images", action="store_true", default=True)
    parser.add_argument("--no-images", dest="include_images", action="store_false")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-retire", action="store_true")
    args = parser.parse_args()

    if not os.environ.get("OPENAI_API_KEY", "").strip():
        print("OPENAI_API_KEY is not set. Add it to the environment before generating.")
        return 1

    api_url = args.api_url.rstrip("/")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Admin-Key": args.admin_key,
    }

    cats = req("GET", f"{api_url}/v1/categories", headers={"Accept": "application/json"})
    by_slug = {c["slug"]: c["id"] for c in cats.get("categories", [])}
    missing = LIVE_CATEGORIES - set(by_slug)
    if missing:
        raise SystemExit(f"Missing categories on API: {', '.join(sorted(missing))}")

    # Snapshot the old batch now but retire it only after the new one is live, so a cancelled
    # or failed run never leaves the feed empty.
    previous = [] if args.skip_retire else list_live(api_url=api_url, headers=headers)
    insights = fetch_insights(api_url=api_url, headers=headers)
    print(
        f"Insights: {insights.get('count', 0)} recent moments, "
        f"{len(insights.get('byCategory') or {})} categories with signal"
    )

    starts = datetime.now(UTC)
    ends = starts + timedelta(hours=args.window_hours)
    stamp = starts.strftime("%Y%m%d%H%M")

    try:
        agent_batch = plan_agent_batch(
            previous,
            per_category=args.per_category,
            window_ends=ends,
            window_hours=args.window_hours,
            insights=insights,
        )
    except Exception as exc:  # noqa: BLE001 — missing key or a failed model call must not retire the feed
        print(f"Agent generation failed: {exc}")
        return 1

    from scripts.content_gen.agent import localize_hi_dicts, volatile_fact_issue

    # Agent batch is the feed; memes are light spice only.
    meme_batch = localize_hi_dicts(build_batch(args.count, include_images=args.include_images))
    batch = agent_batch + meme_batch

    created = 0
    failed = 0
    for raw in batch:
        moment = raw
        needs_images = bool(raw.get("promptImage")) or any(
            isinstance(o, dict) and o.get("image") for o in (raw.get("options") or [])
        )
        if needs_images:
            if not args.include_images:
                continue
            hydrated = hydrate_images(
                raw,
                api_url=api_url,
                headers=headers,
                dry_run=args.dry_run,
                stamp=stamp,
            )
            if not hydrated:
                failed += 1
                print(f"SKIP image moment (hydrate failed): {raw.get('prompt', '')[:50]}")
                continue
            moment = hydrated

        # Every published card expires with the refresh window so the next run can replace it.
        if not moment.get("endsAt"):
            moment = {**moment, "endsAt": ends.isoformat().replace("+00:00", "Z")}

        tags = set(moment.get("tags") or [])
        is_quiz = "quiz" in tags or moment.get("scoringMode") == "correct_option"
        if is_quiz and not moment.get("briefId"):
            blocked = volatile_fact_issue(str(moment.get("prompt") or ""))
            if blocked:
                failed += 1
                print(f"SKIP unvalidated quiz ({blocked}): {moment.get('prompt', '')[:60]}")
                continue

        cat_id = by_slug[moment["categorySlug"]]
        ok = publish_moment(
            api_url=api_url,
            headers=headers,
            category_id=cat_id,
            moment=moment,
            starts=starts,
            ends=ends,
            dry_run=args.dry_run,
        )
        if ok:
            created += 1
        else:
            failed += 1

    retired = 0
    if created:
        retired = retire_moments(previous, api_url=api_url, headers=headers, dry_run=args.dry_run)
    elif previous:
        print(f"Nothing published; keeping the {len(previous)} live moments.")

    print(
        f"\nRefresh done: retired={retired} created={created} failed={failed} "
        f"per_category={args.per_category} count_target={args.count} "
        f"images={args.include_images} dry_run={args.dry_run}"
    )
    return 0 if failed == 0 or created > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
