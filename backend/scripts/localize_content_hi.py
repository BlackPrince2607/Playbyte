"""Create hi-IN content_items from English pack JSON (or DB-ready items).

    python -m scripts.localize_content_hi --dry-run
    python -m scripts.localize_content_hi
    python -m scripts.localize_content_hi path/to/fact.json --batch-size 20

Requires OPENAI_API_KEY. Everyday spoken Hindi (bolchal) with common English loanwords.
Hindi rows use id suffix `.hi` and locale `hi-IN` so English packs stay untouched.
"""

from __future__ import annotations

import argparse
import asyncio
import copy
import json
import sys
from pathlib import Path
from typing import Any

from app.modules.content.validation import validate_items
from scripts.content_gen.agent import call_openai, require_key
from scripts.import_content import DEFAULT_DIR, load_pack_file

HI_LOCALE = "hi-IN"
HI_STYLE = (
    "Gen-Z Hinglish bolchal in Devanagari — spoken Hindi with English loanwords people say "
    "(गेम, क्विज़, वाइब, एक्साइटेड, स्किप, ट्रेंड, सीन). "
    "Keep proper names and numbers. Avoid stiff textbook Hindi and Latin-script Hinglish. "
    "Do not invent facts."
)


def _hi_id(item_id: str) -> str:
    return item_id if item_id.endswith(".hi") else f"{item_id}.hi"


def _collect_strings(item: dict[str, Any]) -> list[tuple[str, str]]:
    """Return (path, text) pairs for user-facing English strings."""
    out: list[tuple[str, str]] = []
    answer = item.get("answer")
    if isinstance(answer, str) and answer.strip():
        out.append(("answer", answer))
    for i, hint in enumerate(item.get("hints") or []):
        if isinstance(hint, str) and hint.strip():
            out.append((f"hints.{i}", hint))
    for i, alias in enumerate(item.get("aliases") or []):
        if isinstance(alias, str) and alias.strip():
            out.append((f"aliases.{i}", alias))
    for i, fact in enumerate(item.get("facts") or []):
        if not isinstance(fact, dict):
            continue
        text = fact.get("text")
        if isinstance(text, str) and text.strip():
            out.append((f"facts.{i}.text", text))
        expl = fact.get("explanation")
        if isinstance(expl, str) and expl.strip():
            out.append((f"facts.{i}.explanation", expl))
    attrs = item.get("attributes") or {}
    if isinstance(attrs, dict):
        for key in ("prompt", "label", "title", "blurb", "question"):
            val = attrs.get(key)
            if isinstance(val, str) and val.strip():
                out.append((f"attributes.{key}", val))
        distractors = attrs.get("distractors")
        if isinstance(distractors, list):
            for i, d in enumerate(distractors):
                if isinstance(d, str) and d.strip():
                    out.append((f"attributes.distractors.{i}", d))
        options = attrs.get("options")
        if isinstance(options, list):
            for i, opt in enumerate(options):
                if isinstance(opt, str) and opt.strip():
                    out.append((f"attributes.options.{i}", opt))
                elif isinstance(opt, dict):
                    label = opt.get("label") or opt.get("text")
                    if isinstance(label, str) and label.strip():
                        out.append((f"attributes.options.{i}.label", label))
    return out


def _set_path(item: dict[str, Any], path: str, value: str) -> None:
    parts = path.split(".")
    cur: Any = item
    for part in parts[:-1]:
        if part.isdigit():
            cur = cur[int(part)]
        else:
            cur = cur[part]
    last = parts[-1]
    if last.isdigit():
        cur[int(last)] = value
    else:
        cur[last] = value


def _translate_batch(batch: list[dict[str, Any]]) -> dict[str, dict[str, str]]:
    """Map item id -> {path: hindi}."""
    payload = {
        "style": HI_STYLE,
        "items": [
            {"id": it["id"], "strings": [{"path": path, "text": text} for path, text in _collect_strings(it)]}
            for it in batch
        ],
        "rules": [
            "Return JSON: {\"items\": [{\"id\", \"strings\": [{\"path\", \"textHi\"}]}]} .",
            "Keep every path. textHi is everyday spoken Hindi for text.",
        ],
    }
    messages = [
        {
            "role": "system",
            "content": "You translate Maja game content into everyday spoken Hindi. Reply with JSON only.",
        },
        {"role": "user", "content": json.dumps(payload)},
    ]
    raw = call_openai(messages)
    by_id: dict[str, dict[str, str]] = {}
    for row in raw.get("items") or []:
        if not isinstance(row, dict) or row.get("id") is None:
            continue
        mapping: dict[str, str] = {}
        for s in row.get("strings") or []:
            if isinstance(s, dict) and s.get("path") and s.get("textHi"):
                mapping[str(s["path"])] = str(s["textHi"]).strip()
        by_id[str(row["id"])] = mapping
    return by_id


def localize_items(items: list[dict[str, Any]], *, batch_size: int = 15) -> list[dict[str, Any]]:
    require_key()
    out: list[dict[str, Any]] = []
    for start in range(0, len(items), batch_size):
        batch = items[start : start + batch_size]
        translations = _translate_batch(batch)
        for item in batch:
            hi = copy.deepcopy(item)
            mapping = translations.get(item["id"], {})
            for path, text_hi in mapping.items():
                try:
                    _set_path(hi, path, text_hi)
                except (KeyError, IndexError, TypeError):
                    continue
            hi["id"] = _hi_id(str(item["id"]))
            hi["locale"] = HI_LOCALE
            out.append(hi)
    return out


async def _write(items: list[dict[str, Any]]) -> None:
    from app.infrastructure.postgres.db import SessionLocal
    from app.modules.content.service import upsert_items

    async with SessionLocal() as session:
        await upsert_items(session, items)
        await session.commit()
    print(f"upserted {len(items)} hi-IN items")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--batch-size", type=int, default=15)
    args = parser.parse_args(argv)
    paths = args.paths or sorted(DEFAULT_DIR.glob("*.json"))
    if not paths:
        print("no pack files found", file=sys.stderr)
        return 1

    english: list[dict[str, Any]] = []
    errors: list[str] = []
    for path in paths:
        _meta, items, errs = load_pack_file(path)
        errors.extend(errs)
        english.extend(items)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    if not english:
        print("no items to localize", file=sys.stderr)
        return 1

    try:
        localized = localize_items(english, batch_size=max(1, args.batch_size))
    except Exception as exc:  # noqa: BLE001
        print(f"localize failed: {exc}", file=sys.stderr)
        return 1

    valid, verrs = validate_items(localized)
    if verrs:
        print("\n".join(verrs[:20]), file=sys.stderr)
        return 1
    if args.dry_run:
        print(f"{len(valid)} hi-IN items OK")
        for it in valid[:3]:
            print(f"  {it['id']} locale={it['locale']}")
        return 0
    asyncio.run(_write(valid))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
