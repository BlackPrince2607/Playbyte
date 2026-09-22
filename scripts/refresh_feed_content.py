"""Retire live feed moments and flood a fresh text + image/meme batch via admin API.

Usage:
  python scripts/refresh_feed_content.py --dry-run
  python scripts/refresh_feed_content.py --api-url https://playbyte-production.up.railway.app --count 40
  python scripts/refresh_feed_content.py --no-images
"""

from __future__ import annotations

import argparse
import base64
import json
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

TEXT_PACK = ROOT / "docs" / "content" / "category-question-pack.json"
MEME_PACK = ROOT / "docs" / "content" / "meme-image-pack.json"

LIVE_CATEGORIES = {
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
}


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
    request = urllib.request.Request(url, headers={"User-Agent": "playbyte-refresh/1.0"})
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
    """Admin create accepts strings or {label,imageKey,isCorrect} objects."""
    out: list[Any] = []
    for opt in options:
        if isinstance(opt, str):
            out.append(opt)
        else:
            row: dict[str, Any] = {"label": opt.get("label") or opt.get("text") or ""}
            if opt.get("imageKey"):
                row["imageKey"] = opt["imageKey"]
            if opt.get("isCorrect"):
                row["isCorrect"] = True
            out.append(row)
    return out


def load_packs(*, include_images: bool) -> list[dict[str, Any]]:
    moments: list[dict[str, Any]] = []
    text = json.loads(TEXT_PACK.read_text(encoding="utf-8"))
    moments.extend(text.get("moments") or [])
    if include_images and MEME_PACK.exists():
        meme = json.loads(MEME_PACK.read_text(encoding="utf-8"))
        moments.extend(meme.get("moments") or [])
    return [m for m in moments if m.get("categorySlug") in LIVE_CATEGORIES]


def generate_variants(count: int) -> list[dict[str, Any]]:
    from scripts.content_gen.run import generate_batch

    batch = generate_batch(count, ["poll", "poll", "poll", "quiz"])
    out: list[dict[str, Any]] = []
    for m in batch:
        if m.categorySlug not in LIVE_CATEGORIES:
            continue
        out.append(
            {
                "categorySlug": m.categorySlug,
                "type": m.type,
                "tags": m.tags,
                "scoringMode": m.scoringMode,
                "prompt": m.prompt,
                "options": m.options,
                "restrictedTopic": "none",
            }
        )
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


def retire_live(*, api_url: str, headers: dict[str, str], dry_run: bool) -> int:
    existing = req("GET", f"{api_url}/v1/admin/moments", headers=headers)
    live = [m for m in existing.get("moments", []) if m.get("status") == "live"]
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
        "endsAt": ends.isoformat().replace("+00:00", "Z"),
        "scoringMode": moment.get("scoringMode") or "none",
        "tags": list(moment.get("tags") or ["poll"]),
    }
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
    pack = load_packs(include_images=include_images)
    random.shuffle(pack)
    variants = generate_variants(max(count, 20))
    random.shuffle(variants)
    combined = pack + variants
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Retire live moments and flood a fresh feed batch")
    parser.add_argument("--api-url", default="https://playbyte-production.up.railway.app")
    parser.add_argument("--admin-key", default="dev-admin-key")
    parser.add_argument("--count", type=int, default=40)
    parser.add_argument("--window-hours", type=float, default=5.0)
    parser.add_argument("--include-images", dest="include_images", action="store_true", default=True)
    parser.add_argument("--no-images", dest="include_images", action="store_false")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-retire", action="store_true")
    args = parser.parse_args()

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

    retired = 0
    if not args.skip_retire:
        retired = retire_live(api_url=api_url, headers=headers, dry_run=args.dry_run)

    batch = build_batch(args.count, include_images=args.include_images)
    starts = datetime.now(UTC)
    ends = starts + timedelta(hours=args.window_hours)
    stamp = starts.strftime("%Y%m%d%H%M")

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

    print(
        f"\nRefresh done: retired={retired} created={created} failed={failed} "
        f"count_target={args.count} images={args.include_images} dry_run={args.dry_run}"
    )
    return 0 if failed == 0 or created > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
