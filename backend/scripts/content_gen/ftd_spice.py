"""Find-the-difference spice for feed refresh.

Does not invent image pairs with the LLM. Pulls from ops-maintained pack JSON when
present. Pack path: docs/content/ftd-image-pack.json (optional).

Spot the Difference is a standalone visual game — themes are picture packs
(objects / city / garden / space), not Bollywood / Mythology / etc.

Schema per moment:
  {
    "categorySlug": "memory-games",
    "contentType": "space",
    "prompt": "Spot the difference",
    "promptImageKey": "...",
    "options": [{"label": "Left", "imageKey": "..."}, {"label": "Right", "imageKey": "..."}],
    "type": "predict",
    "tags": ["game"]
  }

`categorySlug` must be `memory-games` (or omit — defaults there). `contentType` is the
theme pack id (objects, city, garden, space).
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any

from scripts.content_gen.taxonomy import (
    FORMAT_FIND_THE_DIFFERENCE,
    formats_for,
    normalize_slug,
    types_for,
)

ROOT = Path(__file__).resolve().parents[3]
FTD_PACK = ROOT / "docs" / "content" / "ftd-image-pack.json"
FTD_HOME = "memory-games"


def load_ftd_pack(path: Path | None = None) -> list[dict[str, Any]]:
    pack_path = path or FTD_PACK
    if not pack_path.exists():
        return []
    try:
        data = json.loads(pack_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    rows = data.get("moments") if isinstance(data, dict) else data
    if not isinstance(rows, list):
        return []
    allowed_themes = set(types_for(FTD_HOME, FORMAT_FIND_THE_DIFFERENCE)) or {
        "objects",
        "city",
        "garden",
        "space",
    }
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        raw_slug = str(row.get("categorySlug") or FTD_HOME).strip() or FTD_HOME
        slug = normalize_slug(raw_slug)
        # Legacy topic-tied rows (bollywood, mythology, …) are ignored — FTD is standalone.
        if slug != FTD_HOME or FORMAT_FIND_THE_DIFFERENCE not in formats_for(slug):
            continue
        theme = str(row.get("contentType") or row.get("questionType") or "objects").strip()
        if theme not in allowed_themes:
            continue
        prompt = str(row.get("prompt") or "Spot the difference").strip()
        options = row.get("options") or []
        if not prompt or not isinstance(options, list) or len(options) < 2:
            continue
        out.append(
            {
                "categorySlug": FTD_HOME,
                "type": row.get("type") or "predict",
                "tags": ["game"],
                "scoringMode": "none",
                "contentFormat": FORMAT_FIND_THE_DIFFERENCE,
                "contentType": theme,
                "prompt": prompt,
                "promptImageKey": row.get("promptImageKey") or row.get("prompt_image_key"),
                "options": options,
                "contentLang": str(row.get("contentLang") or "en"),
            }
        )
    return out


def ftd_spice_for(slug: str, *, limit: int = 2) -> list[dict[str, Any]]:
    """Up to `limit` FTD moments when refreshing memory-games (empty otherwise)."""
    key = normalize_slug(slug)
    if key != FTD_HOME or FORMAT_FIND_THE_DIFFERENCE not in formats_for(key):
        return []
    pool = list(load_ftd_pack())
    if not pool:
        return []
    random.shuffle(pool)
    return pool[: max(0, limit)]
