"""Find-the-difference spice for feed refresh.

Does not invent image pairs with the LLM. Pulls from ops-maintained pack JSON when
present. Pack path: docs/content/ftd-image-pack.json (optional).

Schema per moment:
  {
    "categorySlug": "bollywood",
    "contentType": "movie_scenes",
    "prompt": "Spot the difference",
    "promptImageKey": "...",
    "options": [{"label": "Left", "imageKey": "..."}, {"label": "Right", "imageKey": "..."}],
    "type": "predict",
    "tags": ["game"]
  }
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
)

ROOT = Path(__file__).resolve().parents[3]
FTD_PACK = ROOT / "docs" / "content" / "ftd-image-pack.json"


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
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        slug = normalize_slug(str(row.get("categorySlug") or ""))
        if not slug or FORMAT_FIND_THE_DIFFERENCE not in formats_for(slug):
            continue
        prompt = str(row.get("prompt") or "Spot the difference").strip()
        options = row.get("options") or []
        if not prompt or not isinstance(options, list) or len(options) < 2:
            continue
        out.append(
            {
                "categorySlug": slug,
                "type": row.get("type") or "predict",
                "tags": ["game"],
                "scoringMode": "none",
                "contentFormat": FORMAT_FIND_THE_DIFFERENCE,
                "contentType": str(row.get("contentType") or row.get("questionType") or "scenes"),
                "prompt": prompt,
                "promptImageKey": row.get("promptImageKey") or row.get("prompt_image_key"),
                "options": options,
                "contentLang": str(row.get("contentLang") or "en"),
            }
        )
    return out


def ftd_spice_for(slug: str, *, limit: int = 2) -> list[dict[str, Any]]:
    """Up to `limit` FTD moments for one category (empty if no pack)."""
    key = normalize_slug(slug)
    if FORMAT_FIND_THE_DIFFERENCE not in formats_for(key):
        return []
    pool = [m for m in load_ftd_pack() if m["categorySlug"] == key]
    if not pool:
        return []
    random.shuffle(pool)
    return pool[: max(0, limit)]
