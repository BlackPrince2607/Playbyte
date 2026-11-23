"""
Bake left/right variants from apps/mobile/assets/spot-pairs/*.jpg (base scenes),
write *_left.jpg / *_right.jpg, and rewrite spot_pair.json with asset:spot/ URLs
and hitboxes.

Differences must look like real scene changes (a detail missing, a colour shift)
— never solid colour stamps, hard rectangles, or dark “UI” blotches that read as hints.
"""
from __future__ import annotations

import colorsys
import hashlib
import io
import json
import math
import random
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
ASSETS = ROOT / "apps" / "mobile" / "assets" / "spot-pairs"
OUT_PACK = ROOT / "apps" / "mobile" / "src" / "game" / "content" / "packs" / "spot_pair.json"
ASPECT, W, H = 0.625, 800, 500

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

# Object-ish centres in the flat scenes (lamp, frames, sofa, table, curtains…).
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


def clamp(v: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, v))


def soft_weight(dx: float, dy: float, r: float) -> float:
    """1 at centre → 0 at edge; smoothstep so edits don't leave box edges."""
    d = math.hypot(dx, dy) / max(1.0, r)
    if d >= 1.0:
        return 0.0
    t = 1.0 - d
    return t * t * (3.0 - 2.0 * t)


def iter_disk(cx: int, cy: int, r: int):
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r, cx + r + 1):
            if x < 0 or y < 0 or x >= W or y >= H:
                continue
            w = soft_weight(x - cx, y - cy, r)
            if w > 0:
                yield x, y, w


def surround_color(pix, cx: int, cy: int, r: int) -> tuple[float, float, float]:
    """Average colour in a ring just outside the edit — used to erase objects cleanly."""
    rs, gs, bs, n = 0.0, 0.0, 0.0, 0
    inner, outer = r + 2, r + 10
    for y in range(cy - outer, cy + outer + 1):
        for x in range(cx - outer, cx + outer + 1):
            if x < 0 or y < 0 or x >= W or y >= H:
                continue
            d = math.hypot(x - cx, y - cy)
            if inner <= d <= outer:
                r0, g0, b0 = pix[x, y]
                rs += r0
                gs += g0
                bs += b0
                n += 1
    if n == 0:
        r0, g0, b0 = pix[clamp(cx, 0, W - 1), clamp(cy, 0, H - 1)]
        return float(r0), float(g0), float(b0)
    return rs / n, gs / n, bs / n


def erase_detail(im: Image.Image, cx: int, cy: int, r: int, fill: tuple[float, float, float] | None = None) -> None:
    """Blend the disk toward a fill colour so a small object disappears / changes."""
    pix = im.load()
    sr, sg, sb = fill if fill is not None else surround_color(pix, cx, cy, r)
    for x, y, w in iter_disk(cx, cy, r):
        r0, g0, b0 = pix[x, y]
        # Full replace at centre, soft edge — readable after JPEG.
        a = min(1.0, w * 1.05)
        pix[x, y] = (
            int(r0 * (1 - a) + sr * a),
            int(g0 * (1 - a) + sg * a),
            int(b0 * (1 - a) + sb * a),
        )


def distant_fill(pix, cx: int, cy: int) -> tuple[float, float, float]:
    """Sample a far pixel so erase still changes flat washes (sky / sofa / nebula)."""
    for dx, dy in ((70, 20), (-60, 30), (40, -50), (-55, -25), (0, 65), (80, 0)):
        x, y = clamp(cx + dx, 0, W - 1), clamp(cy + dy, 0, H - 1)
        r0, g0, b0 = pix[x, y]
        return float(r0), float(g0), float(b0)
    r0, g0, b0 = pix[cx, cy]
    return float(r0), float(g0), float(b0)


def hue_shift(im: Image.Image, cx: int, cy: int, r: int, shift: float) -> None:
    """Retint saturated pixels only — flat walls/sky stay put, objects change colour."""
    pix = im.load()
    for x, y, w in iter_disk(cx, cy, r):
        r0, g0, b0 = pix[x, y]
        h, s, v = colorsys.rgb_to_hsv(r0 / 255.0, g0 / 255.0, b0 / 255.0)
        if s < 0.12:
            continue
        a = w * 0.95
        h2 = (h + shift) % 1.0
        s2 = min(1.0, s * (1.0 + 0.2 * a))
        rr, gg, bb = colorsys.hsv_to_rgb(h2, s2, v)
        pix[x, y] = (
            int(r0 * (1 - a) + rr * 255 * a),
            int(g0 * (1 - a) + gg * 255 * a),
            int(b0 * (1 - a) + bb * 255 * a),
        )


def boost_saturation(im: Image.Image, cx: int, cy: int, r: int, amount: float) -> None:
    pix = im.load()
    for x, y, w in iter_disk(cx, cy, r):
        r0, g0, b0 = pix[x, y]
        h, s, v = colorsys.rgb_to_hsv(r0 / 255.0, g0 / 255.0, b0 / 255.0)
        if s < 0.08:
            continue
        a = w * min(1.0, abs(amount))
        s2 = min(1.0, s * (1.0 + amount)) if amount > 0 else max(0.0, s * (1.0 + amount))
        rr, gg, bb = colorsys.hsv_to_rgb(h, s2, v)
        pix[x, y] = (
            int(r0 * (1 - a) + rr * 255 * a),
            int(g0 * (1 - a) + gg * 255 * a),
            int(b0 * (1 - a) + bb * 255 * a),
        )


def region_mad(a: Image.Image, b: Image.Image, cx: int, cy: int, r: int) -> float:
    pa, pb = a.load(), b.load()
    total, n = 0, 0
    for x, y, _w in iter_disk(cx, cy, r):
        ca, cb = pa[x, y], pb[x, y]
        total += abs(ca[0] - cb[0]) + abs(ca[1] - cb[1]) + abs(ca[2] - cb[2])
        n += 1
    return (total / (3 * n)) if n else 0.0


def jpeg_roundtrip(im: Image.Image, quality: int = 92) -> Image.Image:
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    return Image.open(buf).convert("RGB")


def playable_mad(a: Image.Image, b: Image.Image, cx: int, cy: int, r: int) -> float:
    """MAD after JPEG — matches what the app ships."""
    return region_mad(jpeg_roundtrip(a), jpeg_roundtrip(b), cx, cy, r)


def region_colorfulness(im: Image.Image, cx: int, cy: int, r: int) -> tuple[float, float]:
    """Return (mean saturation, luminance std) — high values ⇒ object-like detail."""
    pix = im.load()
    sats: list[float] = []
    lums: list[float] = []
    for x, y, _w in iter_disk(cx, cy, r):
        r0, g0, b0 = pix[x, y]
        _h, s, v = colorsys.rgb_to_hsv(r0 / 255.0, g0 / 255.0, b0 / 255.0)
        sats.append(s)
        lums.append(v)
    if not sats:
        return 0.0, 0.0
    mean_s = sum(sats) / len(sats)
    mean_v = sum(lums) / len(lums)
    var = sum((v - mean_v) ** 2 for v in lums) / len(lums)
    return mean_s, math.sqrt(var)


# Post-JPEG MAD floor so every hit region stays findable in the shipped assets.
MIN_MAD = 8.0


def edits_for_region(im: Image.Image, cx: int, cy: int, r: int, rng: random.Random) -> list:
    """Flat washes → distant fill (no neon stains). Colourful objects → hue/sat + erase."""
    sat, contrast = region_colorfulness(im, cx, cy, r)
    colourful = sat > 0.22 and contrast > 0.06
    pix = im.load()
    far = distant_fill(pix, cx, cy)
    if colourful:
        fns = [
            lambda im, cx, cy, r: hue_shift(im, cx, cy, r, 0.28),
            lambda im, cx, cy, r: hue_shift(im, cx, cy, r, -0.26),
            lambda im, cx, cy, r: hue_shift(im, cx, cy, r, 0.42),
            lambda im, cx, cy, r: boost_saturation(im, cx, cy, r, 0.85),
            lambda im, cx, cy, r: erase_detail(im, cx, cy, r),
            lambda im, cx, cy, r, fill=far: erase_detail(im, cx, cy, r, fill),
        ]
    else:
        # Flat wall / sofa / sky: pull toward a distant colour so the change stays visible.
        fns = [
            lambda im, cx, cy, r, fill=far: erase_detail(im, cx, cy, r, fill),
            lambda im, cx, cy, r, fill=far: erase_detail(im, cx, cy, r + 6, fill),
            lambda im, cx, cy, r, fill=far: erase_detail(im, cx, cy, max(30, r - 2), fill),
        ]
    rng.shuffle(fns)
    return fns


def make_pair(base: Image.Image, seed: int) -> tuple[Image.Image, Image.Image, list[dict]]:
    rng = random.Random(seed)
    left = base.copy()
    right = base.copy()
    slots = SLOTS[:]
    rng.shuffle(slots)
    diffs: list[dict] = []
    for i, (nx, ny) in enumerate(slots):
        cx, cy = px(nx, ny)
        r = rng.randint(34, 46)
        side_right = i % 2 == 0
        target = right if side_right else left
        other = left if side_right else right
        fns = edits_for_region(target, cx, cy, r, rng)
        chosen: Image.Image | None = None
        for fn in fns:
            trial = target.copy()
            fn(trial, cx, cy, r)
            if playable_mad(trial, other, cx, cy, r) >= MIN_MAD:
                chosen = trial
                break
        if chosen is None:
            # Forced high-contrast fill from a far, different-looking pixel.
            chosen = target.copy()
            pix = chosen.load()
            fills = [distant_fill(pix, cx + dx, cy + dy) for dx, dy in ((90, 40), (-80, 50), (60, -70), (-70, -40))]
            for fill in fills:
                trial = target.copy()
                erase_detail(trial, cx, cy, r + 10, fill)
                if playable_mad(trial, other, cx, cy, r) >= MIN_MAD:
                    chosen = trial
                    break
            else:
                # Absolute fallback: paint a soft accent using inverted centre colour.
                trial = target.copy()
                pr, pg, pb = pix[cx, cy]
                erase_detail(trial, cx, cy, r + 8, (255 - pr, 255 - pg, 255 - pb))
                chosen = trial
        if side_right:
            right = chosen
        else:
            left = chosen
        hw = round(max(0.05, r / W + 0.018), 4)
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
        left, right, diffs = make_pair(base, stable_seed(key + ":v4"))
        left.save(ASSETS / f"{key}_left.jpg", "JPEG", quality=92)
        right.save(ASSETS / f"{key}_right.jpg", "JPEG", quality=92)
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
