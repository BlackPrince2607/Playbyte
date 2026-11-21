"""
Bake left/right variants from apps/mobile/assets/spot-pairs/*.jpg (base scenes),
write *_left.jpg / *_right.jpg, and rewrite spot_pair.json with asset:spot/ URLs
and hitboxes — no runtime overlay marks.
"""
from __future__ import annotations

import hashlib
import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
ASSETS = ROOT / "apps" / "mobile" / "assets" / "spot-pairs"
OUT_PACK = ROOT / "apps" / "mobile" / "src" / "game" / "content" / "packs" / "spot_pair.json"
ASPECT, W, H = 0.625, 800, 500

# key = filename stem of the base flat art
SCENES: list[tuple[str, str, str]] = [
    ("shapes_desk_1", "shapes", "Office desk"),
    ("shapes_kitchen_1", "shapes", "Kitchen counter"),
    ("shapes_living_1", "shapes", "Living room"),
    ("shapes_shelf_1", "shapes", "Book shelf"),
    ("city_skyline_1", "city", "City skyline"),
    ("city_street_1", "city", "Busy street"),
    ("city_night_1", "city", "Night lights"),
    ("city_market_1", "city", "Urban market"),
    ("garden_flowers_1", "garden", "Flower bed"),
    ("garden_park_1", "garden", "Park lawn"),
    ("garden_path_1", "garden", "Garden path"),
    ("garden_greenhouse_1", "garden", "Greenhouse"),
    ("space_nebula_1", "space", "Nebula"),
    ("space_milky_1", "space", "Milky Way"),
    ("space_earth_1", "space", "Earth from orbit"),
    ("space_stars_1", "space", "Star field"),
]

SLOTS = [
    (0.18, 0.20),
    (0.50, 0.16),
    (0.82, 0.22),
    (0.22, 0.42),
    (0.72, 0.40),
    (0.48, 0.50),
]


def stable_seed(key: str) -> int:
    return int(hashlib.md5(key.encode()).hexdigest()[:8], 16)


def px(nx: float, ny: float) -> tuple[int, int]:
    return int(nx * W), int(ny * W)


def clone_patch(im: Image.Image, cx: int, cy: int, r: int, ox: int, oy: int) -> None:
    src = im.crop((cx + ox - r, cy + oy - r, cx + ox + r, cy + oy + r))
    im.paste(src, (cx - r, cy - r))


def recolor_disk(im: Image.Image, cx: int, cy: int, r: int, factor: float = 2.0) -> None:
    overlay = Image.new("RGB", im.size)
    overlay.paste(im)
    box = (cx - r, cy - r, cx + r, cy + r)
    crop = im.crop(box)
    tinted = ImageEnhance.Color(crop).enhance(factor)
    tinted = ImageEnhance.Brightness(tinted).enhance(1.2)
    mask = Image.new("L", crop.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, crop.size[0] - 1, crop.size[1] - 1), fill=255)
    overlay.paste(tinted, box[:2], mask)
    im.paste(overlay)


def accent_disk(im: Image.Image, cx: int, cy: int, r: int, color: tuple[int, int, int]) -> None:
    layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse((cx - r, cy - r, cx + r, cy + r), fill=(*color, 220))
    base = im.convert("RGBA")
    im.paste(Image.alpha_composite(base, layer).convert("RGB"))


def brighten_rect(im: Image.Image, cx: int, cy: int, hw: int, hh: int, factor: float) -> None:
    box = (cx - hw, cy - hh, cx + hw, cy + hh)
    im.paste(ImageEnhance.Brightness(im.crop(box)).enhance(factor), box[:2])


def flip_patch(im: Image.Image, cx: int, cy: int, r: int) -> None:
    box = (cx - r, cy - r, cx + r, cy + r)
    im.paste(im.crop(box).transpose(Image.Transpose.FLIP_LEFT_RIGHT), box[:2])


def darken_disk(im: Image.Image, cx: int, cy: int, r: int) -> None:
    brighten_rect(im, cx, cy, r, r, 0.55)


EDITS = [
    ("recolor", lambda im, cx, cy, r: recolor_disk(im, cx, cy, r, 2.2)),
    ("hide", lambda im, cx, cy, r: clone_patch(im, cx, cy, r, 36, 12)),
    ("accent", lambda im, cx, cy, r: accent_disk(im, cx, cy, max(10, r // 2), (255, 90, 70))),
    ("bright", lambda im, cx, cy, r: brighten_rect(im, cx, cy, r, r, 1.45)),
    ("flip", lambda im, cx, cy, r: flip_patch(im, cx, cy, r)),
    ("darken", lambda im, cx, cy, r: darken_disk(im, cx, cy, r)),
]


def make_pair(base: Image.Image, seed: int) -> tuple[Image.Image, Image.Image, list[dict]]:
    rng = random.Random(seed)
    left = base.copy()
    right = base.copy()
    edits = EDITS[:]
    rng.shuffle(edits)
    slots = SLOTS[:]
    rng.shuffle(slots)
    diffs: list[dict] = []
    for i, ((nx, ny), (_name, fn)) in enumerate(zip(slots, edits)):
        cx, cy = px(nx, ny)
        r = rng.randint(26, 40)
        target = right if i % 2 == 0 else left
        fn(target, cx, cy, r)
        hw = round(max(0.05, r / W + 0.012), 4)
        x = min(1 - hw, max(hw, nx))
        y = min(ASPECT - hw, max(hw, ny))
        diffs.append({"id": f"d{i + 1}", "x": round(x, 4), "y": round(y, 4), "hw": hw, "hh": hw})
    return left, right, diffs


def main() -> None:
    items = []
    cat_counts: dict[str, int] = {}
    for key, cat, title in SCENES:
        src = ASSETS / f"{key}.jpg"
        if not src.exists():
            raise SystemExit(f"missing base art {src}")
        base = Image.open(src).convert("RGB").resize((W, H), Image.Resampling.LANCZOS)
        left, right, diffs = make_pair(base, stable_seed(key))
        left.save(ASSETS / f"{key}_left.jpg", "JPEG", quality=90)
        right.save(ASSETS / f"{key}_right.jpg", "JPEG", quality=90)
        left_url = f"asset:spot/{key}_left"
        right_url = f"asset:spot/{key}_right"
        cat_idx = cat_counts.get(cat, 0)
        cat_counts[cat] = cat_idx + 1
        slug = key[len(cat) + 1 :]
        items.append(
            {
                "id": f"spot.{cat}.{slug}",
                "type": "spot_pair",
                "categories": [cat],
                "difficulty": round(0.2 + cat_idx * 0.15, 2),
                "popularity": round(0.9 - cat_idx * 0.1, 2),
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
        print(f"ok {key}")

    OUT_PACK.write_text(
        json.dumps({"packId": "spot_pair", "title": "Spot the Difference scenes", "items": items}, indent=2) + "\n",
        encoding="utf-8",
    )
    print("wrote", OUT_PACK, len(items))


if __name__ == "__main__":
    main()
