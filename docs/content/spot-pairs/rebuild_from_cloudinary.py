"""
Rebuild spot_pair.json from Cloudinary left/right URLs.
Hitboxes are derived by comparing the baked pair JPEGs so A/B truly differ
without runtime overlay marks.
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
TMP = Path(__file__).parent / "tmp"
CACHE = Path(__file__).parent / "cloudinary_cache.json"
OUT = ROOT / "apps" / "mobile" / "src" / "game" / "content" / "packs" / "spot_pair.json"
ASPECT, W, H = 0.625, 800, 500
MIN_HW = 0.05

SOURCES = {
    "shapes": [
        ("desk_1", "Office desk"),
        ("kitchen_1", "Kitchen counter"),
        ("living_1", "Living room"),
        ("shelf_1", "Book shelf"),
    ],
    "city": [
        ("skyline_1", "City skyline"),
        ("street_1", "Busy street"),
        ("night_1", "Night lights"),
        ("market_1", "Urban market"),
    ],
    "garden": [
        ("flowers_1", "Flower bed"),
        ("park_1", "Park lawn"),
        ("path_1", "Garden path"),
        ("greenhouse_1", "Greenhouse"),
    ],
    "space": [
        ("nebula_1", "Nebula"),
        ("milky_1", "Milky Way"),
        ("earth_1", "Earth from orbit"),
        ("stars_1", "Star field"),
    ],
}


def find_diff_regions(left: Image.Image, right: Image.Image, max_regions: int = 6) -> list[dict]:
    """Cluster changed pixels into up to max_regions hitboxes in game coords (y vs width)."""
    a = left.convert("RGB").load()
    b = right.convert("RGB").load()
    # Downsample mask for speed.
    step = 4
    changed: list[tuple[int, int]] = []
    for y in range(0, H, step):
        for x in range(0, W, step):
            pa, pb = a[x, y], b[x, y]
            if abs(pa[0] - pb[0]) + abs(pa[1] - pb[1]) + abs(pa[2] - pb[2]) > 40:
                changed.append((x, y))
    if len(changed) < 8:
        raise RuntimeError("pair looks identical — no usable pixel diffs")

    # Greedy clustering: pick densest remaining points as centres.
    remaining = changed[:]
    centres: list[tuple[float, float, float]] = []  # cx, cy, radius_px
    while remaining and len(centres) < max_regions:
        # Seed = point with most neighbours within 55px.
        best_i, best_n = 0, -1
        for i, (x, y) in enumerate(remaining):
            n = sum(1 for ox, oy in remaining if (ox - x) ** 2 + (oy - y) ** 2 <= 55 ** 2)
            if n > best_n:
                best_i, best_n = i, n
        sx, sy = remaining[best_i]
        cluster = [(x, y) for x, y in remaining if (x - sx) ** 2 + (y - sy) ** 2 <= 70 ** 2]
        cx = sum(p[0] for p in cluster) / len(cluster)
        cy = sum(p[1] for p in cluster) / len(cluster)
        rad = max(28.0, max(((p[0] - cx) ** 2 + (p[1] - cy) ** 2) ** 0.5 for p in cluster) + 8)
        centres.append((cx, cy, rad))
        remaining = [p for p in remaining if (p[0] - cx) ** 2 + (p[1] - cy) ** 2 > 90 ** 2]

    # Drop overlapping centres (keep larger first).
    centres.sort(key=lambda c: c[2], reverse=True)
    kept: list[tuple[float, float, float]] = []
    for cx, cy, rad in centres:
        if any((cx - kx) ** 2 + (cy - ky) ** 2 < (rad + kr) ** 2 * 0.35 for kx, ky, kr in kept):
            continue
        kept.append((cx, cy, rad))
    if len(kept) < 3:
        raise RuntimeError(f"only {len(kept)} regions found")

    diffs = []
    for i, (cx, cy, rad) in enumerate(kept[:max_regions]):
        hw = max(MIN_HW, rad / W)
        # Clamp so the box stays inside [0,1] x [0, ASPECT].
        x = min(1 - hw, max(hw, cx / W))
        y = min(ASPECT - hw, max(hw, cy / W))
        diffs.append({"id": f"d{i + 1}", "x": round(x, 4), "y": round(y, 4), "hw": round(hw, 4), "hh": round(hw, 4)})
    return diffs


def main() -> None:
    cache: dict[str, str] = json.loads(CACHE.read_text(encoding="utf-8"))
    items = []
    for cat, rows in SOURCES.items():
        for idx, (slug, title) in enumerate(rows):
            key = f"{cat}_{slug}"
            left_url = cache[f"{key}_left"]
            right_url = cache[f"{key}_right"]
            if left_url == right_url:
                raise SystemExit(f"same URL for both sides: {key}")
            lp, rp = TMP / f"{key}_left.jpg", TMP / f"{key}_right.jpg"
            if not lp.exists() or not rp.exists():
                raise SystemExit(f"missing local pair files for {key}")
            left = Image.open(lp).resize((W, H))
            right = Image.open(rp).resize((W, H))
            diffs = find_diff_regions(left, right)
            items.append(
                {
                    "id": f"spot.{cat}.{slug}",
                    "type": "spot_pair",
                    "categories": [cat],
                    "difficulty": round(0.2 + idx * 0.15, 2),
                    "popularity": round(0.9 - idx * 0.1, 2),
                    "media": [
                        {"kind": "image", "url": left_url, "w": W, "h": H, "alt": "Picture A"},
                        {"kind": "image", "url": right_url, "w": W, "h": H, "alt": "Picture B"},
                    ],
                    "attributes": {
                        "title": title,
                        "aspect": ASPECT,
                        "leftUrl": left_url,
                        "rightUrl": right_url,
                        "diffs": diffs,
                    },
                    "status": "approved",
                }
            )
            print(f"ok {key} diffs={len(diffs)}")

    OUT.write_text(
        json.dumps({"packId": "spot_pair", "title": "Spot the Difference scenes", "items": items}, indent=2) + "\n",
        encoding="utf-8",
    )
    print("wrote", OUT, len(items))


if __name__ == "__main__":
    main()
