"""Content validation pipeline (mirrors apps/mobile/src/game/content/validate.ts).

Runs on every ingest path: admin upsert, the seed importer, and any generated / AI content.
"""

import re
from typing import Any

ID_RE = re.compile(r"^[a-z0-9][a-z0-9_.:-]{0,79}$")
TYPE_RE = re.compile(r"^[a-z][a-z0-9_]{1,39}$")
STATUSES = {"draft", "approved", "retired"}

BLOCKLIST = ("fuck", "shit", "bitch", "rape", "nazi", "porn", "slut", "chutiya", "madarchod", "behenchod")
_BLOCK_RES = [re.compile(rf"(^|[^a-z]){w}([^a-z]|$)") for w in BLOCKLIST]


class ContentValidationError(ValueError):
    pass


def contains_blocked(text: str) -> bool:
    t = text.lower()
    return any(r.search(t) for r in _BLOCK_RES)


def _texts(x: Any, depth: int = 0) -> list[str]:
    if depth > 4:
        return []
    if isinstance(x, str):
        return [x]
    if isinstance(x, list):
        return [s for v in x for s in _texts(v, depth + 1)]
    if isinstance(x, dict):
        return [s for v in x.values() for s in _texts(v, depth + 1)]
    return []


def _unit(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and 0 <= x <= 1


def _str_list(x: Any) -> bool:
    return isinstance(x, list) and all(isinstance(s, str) for s in x)


def _norm(s: str) -> str:
    return " ".join(s.strip().lower().split())


def validate_item(raw: Any) -> dict:
    """Returns a normalised item dict (camelCase, client shape) or raises ContentValidationError."""
    if not isinstance(raw, dict):
        raise ContentValidationError("item: not an object")
    item_id = raw.get("id")
    if not isinstance(item_id, str) or not ID_RE.match(item_id):
        raise ContentValidationError(f"item: bad id {item_id!r}")

    def fail(msg: str) -> ContentValidationError:
        return ContentValidationError(f"{item_id}: {msg}")

    item_type = raw.get("type")
    if not isinstance(item_type, str) or not TYPE_RE.match(item_type):
        raise fail("bad type")
    for key in ("categories", "tags", "aliases", "hints"):
        if key in raw and raw[key] is not None and not _str_list(raw[key]):
            raise fail(f"{key} must be strings")
    difficulty = raw.get("difficulty", 0.5)
    popularity = raw.get("popularity", 0.5)
    if not _unit(difficulty):
        raise fail("difficulty must be 0..1")
    if not _unit(popularity):
        raise fail("popularity must be 0..1")
    answer = raw.get("answer")
    if answer is not None and (not isinstance(answer, str) or not answer.strip()):
        raise fail("empty answer")
    attributes = raw.get("attributes") or {}
    if not isinstance(attributes, dict):
        raise fail("attributes must be an object")
    status = raw.get("status", "approved")
    if status not in STATUSES:
        raise fail("bad status")

    media = raw.get("media") or []
    if not isinstance(media, list) or len(media) > 8:
        raise fail("media must be an array (max 8)")
    for m in media:
        if not isinstance(m, dict):
            raise fail("media entry not an object")
        kind = m.get("kind")
        if kind == "emoji":
            value = m.get("value")
            if not isinstance(value, str) or not 0 < len(value) <= 64:
                raise fail("emoji value")
        elif kind in ("image", "audio"):
            url = m.get("url")
            if not isinstance(url, str) or not url.startswith("https://"):
                raise fail("media url must be https")
        else:
            raise fail(f"unknown media kind {kind}")

    facts = raw.get("facts") or []
    if not isinstance(facts, list) or len(facts) > 12:
        raise fail("facts must be an array (max 12)")
    for f in facts:
        if not isinstance(f, dict):
            raise fail("fact not an object")
        text = f.get("text")
        if not isinstance(text, str) or not 5 <= len(text) <= 280:
            raise fail("fact text length")
        if not isinstance(f.get("isTrue"), bool):
            raise fail("fact isTrue")

    aliases = raw.get("aliases") or []
    distractors = attributes.get("distractors")
    if isinstance(answer, str) and isinstance(distractors, list):
        a = _norm(answer)
        alias_set = {_norm(x) for x in aliases}
        for d in distractors:
            if isinstance(d, str) and (_norm(d) == a or _norm(d) in alias_set):
                raise fail("answer appears among distractors")

    if any(contains_blocked(t) for t in _texts([answer, aliases, raw.get("hints"), facts, attributes])):
        raise fail("blocked term")

    source = raw.get("source")
    return {
        "id": item_id,
        "type": item_type,
        "schemaVersion": raw.get("schemaVersion", 1) if isinstance(raw.get("schemaVersion"), int) else 1,
        "locale": raw.get("locale") if isinstance(raw.get("locale"), str) else "en-IN",
        "categories": raw.get("categories") or [],
        "tags": raw.get("tags") or [],
        "difficulty": float(difficulty),
        "popularity": float(popularity),
        "answer": answer.strip() if isinstance(answer, str) else None,
        "aliases": aliases,
        "attributes": attributes,
        "media": media,
        "facts": facts,
        "hints": raw.get("hints") or [],
        "distractorGroup": raw.get("distractorGroup") if isinstance(raw.get("distractorGroup"), str) else None,
        "source": source if isinstance(source, dict) else None,
        "status": status,
        "version": raw.get("version", 1) if isinstance(raw.get("version"), int) else 1,
    }


def validate_items(raw_items: list[Any]) -> tuple[list[dict], list[str]]:
    """Validates a batch; returns (valid items, error messages). Duplicate ids keep the first."""
    ok: list[dict] = []
    errors: list[str] = []
    seen: set[str] = set()
    for raw in raw_items:
        try:
            item = validate_item(raw)
        except ContentValidationError as e:
            errors.append(str(e))
            continue
        if item["id"] in seen:
            errors.append(f"{item['id']}: duplicate id")
            continue
        seen.add(item["id"])
        ok.append(item)
    return ok, errors
