"""
Bake left/right variants from apps/mobile/assets/spot-pairs/*.jpg (base scenes),
write *_left.jpg / *_right.jpg, and rewrite spot_pair.json with asset:spot/ URLs
and hitboxes.

Differences must look like classic spot-the-difference edits: a whole object or
part missing, or a clean recolour of an object — never soft circular colour
smudges / stamps that read as UI glitches.

Hitboxes are derived from pixels that actually changed and are never nudged away
from those pixels (overlap → skip the edit, do not slide the box).
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
OUT_PACK_HI = ROOT / "apps" / "mobile" / "src" / "game" / "content" / "packs" / "hi" / "spot_pair.json"
ASPECT, W, H = 0.625, 800, 500
MIN_HW = 0.055
# Every authored change is playable — bake this many object-level edits per scene.
DIFF_COUNT = 5
MIN_MAD = 14.0
# Hitbox must cover at least this fraction of changed pixels near the edit.
MIN_COVER = 0.08

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

HI_TITLES = {
    "Office desk": "ऑफिस डेस्क",
    "Kitchen counter": "रसोई काउंटर",
    "Living room": "लिविंग रूम",
    "Book shelf": "किताबों की अलमारी",
    "City skyline": "शहर की स्काईलाइन",
    "Busy street": "व्यस्त सड़क",
    "Night lights": "रात की रोशनी",
    "Urban market": "शहरी बाज़ार",
    "Flower bed": "फूलों की क्यारी",
    "Park lawn": "पार्क का लॉन",
    "Garden path": "बगीचे का रास्ता",
    "Greenhouse": "ग्रीनहाउस",
    "Nebula": "नेबुला",
    "Milky Way": "आकाशगंगा",
    "Earth from orbit": "अंतरिक्ष से धरती",
    "Star field": "तारों भरा आकाश",
}


def stable_seed(key: str) -> int:
    return int(hashlib.md5(key.encode()).hexdigest()[:8], 16)


def clamp(v: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, v))


def jpeg_roundtrip(im: Image.Image, quality: int = 92) -> Image.Image:
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    return Image.open(buf).convert("RGB")


def region_mad(a: Image.Image, b: Image.Image, pts: list[tuple[int, int]]) -> float:
    pa, pb = a.load(), b.load()
    total = n = 0
    for x, y in pts:
        ca, cb = pa[x, y], pb[x, y]
        total += abs(ca[0] - cb[0]) + abs(ca[1] - cb[1]) + abs(ca[2] - cb[2])
        n += 1
    return (total / (3 * n)) if n else 0.0


def playable_mad(a: Image.Image, b: Image.Image, pts: list[tuple[int, int]]) -> float:
    return region_mad(jpeg_roundtrip(a), jpeg_roundtrip(b), pts)


def neighbors4(x: int, y: int):
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < W and 0 <= ny < H:
            yield nx, ny


def sat_of(color: tuple[int, int, int]) -> float:
    r, g, b = color
    mx, mn = max(r, g, b), min(r, g, b)
    return (mx - mn) / 255.0


def find_objects(im: Image.Image) -> list[dict]:
    """Colour-quantize then keep compact mid-size connected components (props, books…)."""
    q = im.quantize(colors=36, method=Image.Quantize.MEDIANCUT).convert("RGB")
    pix = q.load()
    visited = [[False] * W for _ in range(H)]
    out: list[dict] = []

    for y0 in range(H):
        for x0 in range(W):
            if visited[y0][x0]:
                continue
            color = pix[x0, y0]
            stack = [(x0, y0)]
            visited[y0][x0] = True
            pts: list[tuple[int, int]] = []
            while stack:
                x, y = stack.pop()
                pts.append((x, y))
                for nx, ny in neighbors4(x, y):
                    if not visited[ny][nx] and pix[nx, ny] == color:
                        visited[ny][nx] = True
                        stack.append((nx, ny))

            n = len(pts)
            if n < 180 or n > 3800:
                continue
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            x0b, x1b = min(xs), max(xs)
            y0b, y1b = min(ys), max(ys)
            bw, bh = x1b - x0b + 1, y1b - y0b + 1
            fill = n / (bw * bh)
            if fill < 0.32 or bw > 220 or bh > 180:
                continue
            edge = sum(1 for x, y in pts if x < 2 or y < 2 or x >= W - 2 or y >= H - 2)
            if edge > n * 0.05:
                continue
            sat = sat_of(color)
            # Reject flat floor / wall / wood slices — recolouring them makes neon smudges.
            if sat < 0.12 and y0b > H * 0.55:
                continue
            if sat < 0.08:
                continue
            cx = sum(xs) / n
            cy = sum(ys) / n
            # Prefer colourful, compact props over flat wall slices.
            score = fill * 1.2 + sat * 1.4 + min(1.0, n / 1400) * 0.5 - (bw * bh) / 80_000
            # Slightly prefer mid-scene props over floor strip.
            if cy / H > 0.72:
                score -= 0.35
            out.append(
                {
                    "pts": pts,
                    "cx": cx,
                    "cy": cy,
                    "x0": x0b,
                    "y0": y0b,
                    "x1": x1b,
                    "y1": y1b,
                    "n": n,
                    "fill": fill,
                    "sat": sat,
                    "color": color,
                    "score": score,
                }
            )
    out.sort(key=lambda o: o["score"], reverse=True)
    return out


def pick_objects(cands: list[dict], count: int, rng: random.Random) -> list[dict]:
    """Greedy well-spaced selection among top-scoring object candidates."""
    pool = cands[: max(count * 12, 40)]
    rng.shuffle(pool)
    pool.sort(key=lambda o: o["score"] + rng.random() * 0.2, reverse=True)
    picked: list[dict] = []
    min_dist = 140.0
    for obj in pool:
        if any(math.hypot(obj["cx"] - p["cx"], obj["cy"] - p["cy"]) < min_dist for p in picked):
            continue
        picked.append(obj)
        if len(picked) >= count:
            break
    if len(picked) < count:
        for obj in pool:
            if obj in picked:
                continue
            if any(math.hypot(obj["cx"] - p["cx"], obj["cy"] - p["cy"]) < 105 for p in picked):
                continue
            picked.append(obj)
            if len(picked) >= count:
                break
    return picked[:count]


def expand_with_outlines(pts: list[tuple[int, int]], pix, rounds: int = 2) -> list[tuple[int, int]]:
    """Grow the mask into adjacent dark/line pixels so erases remove cartoon outlines too."""
    mask = set(pts)
    frontier = list(pts)
    for _ in range(rounds):
        extra: list[tuple[int, int]] = []
        for x, y in frontier:
            for nx, ny in neighbors4(x, y):
                if (nx, ny) in mask:
                    continue
                r, g, b = pix[nx, ny]
                if (r + g + b) / 3.0 <= 130:
                    extra.append((nx, ny))
                    mask.add((nx, ny))
        frontier = extra
        if not frontier:
            break
    return list(mask)


def ring_samples(pix, mask: set[tuple[int, int]], pts: list[tuple[int, int]]) -> list[tuple[int, int, int]]:
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    rad = max(16.0, math.sqrt(len(pts) / math.pi) + 12.0)
    samples: list[tuple[int, int, int]] = []
    for ang in list(range(20, 160, 8)) + list(range(0, 360, 15)):
        for scale in (1.05, 1.4, 1.85):
            x = clamp(int(cx + rad * scale * math.cos(math.radians(ang))), 0, W - 1)
            y = clamp(int(cy + rad * scale * math.sin(math.radians(ang))), 0, H - 1)
            if (x, y) in mask:
                continue
            r, g, b = pix[x, y]
            if (r + g + b) / 3.0 < 50:
                continue
            samples.append((r, g, b))
    return samples


def sample_background(pix, mask: set[tuple[int, int]], pts: list[tuple[int, int]]) -> tuple[int, int, int]:
    """Mode colour from a ring outside the object — stable fill, no clone artifacts."""
    samples = ring_samples(pix, mask, pts)
    if not samples:
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        return pix[clamp(int(cx), 0, W - 1), clamp(int(cy), 0, H - 1)]
    buckets: dict[tuple[int, int, int], list[tuple[int, int, int]]] = {}
    for r, g, b in samples:
        key = (r // 18, g // 18, b // 18)
        buckets.setdefault(key, []).append((r, g, b))
    best = max(buckets.values(), key=len)
    n = len(best)
    return (sum(c[0] for c in best) // n, sum(c[1] for c in best) // n, sum(c[2] for c in best) // n)


def exterior_busy(pix, mask: set[tuple[int, int]], pts: list[tuple[int, int]]) -> bool:
    """True when surroundings are multi-coloured — erase would look like a flat blotch."""
    samples = ring_samples(pix, mask, pts)
    if len(samples) < 12:
        return True
    keys = {(r // 24, g // 24, b // 24) for r, g, b in samples}
    return len(keys) >= 7


def is_surface_slice(im: Image.Image, obj: dict) -> bool:
    """
    True when the candidate is a fold/strip of a larger same-coloured surface
    (curtain pleat, wall band, floor plank) — editing these always looks like a smudge.
    """
    pix = im.load()
    color = obj["color"]
    x0 = max(0, obj["x0"] - 18)
    y0 = max(0, obj["y0"] - 18)
    x1 = min(W - 1, obj["x1"] + 18)
    y1 = min(H - 1, obj["y1"] + 18)
    same = 0
    total = 0
    inside = set(obj["pts"])
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if (x, y) in inside:
                continue
            total += 1
            c = pix[x, y]
            if abs(c[0] - color[0]) + abs(c[1] - color[1]) + abs(c[2] - color[2]) <= 36:
                same += 1
    if total < 30:
        return True
    # Lots of the same colour just outside → this is a surface piece, not a prop.
    if same / total >= 0.28:
        return True
    # Very elongated strips (curtain folds, wall bands).
    bw = obj["x1"] - obj["x0"] + 1
    bh = obj["y1"] - obj["y0"] + 1
    if max(bw, bh) / max(1, min(bw, bh)) >= 3.2 and obj["n"] > 700:
        return True
    return False


def _is_neon_hsv(h: float, s: float, v: float) -> bool:
    """Electric cyan/aqua only — purple/pink prop recolours are valid game diffs."""
    if s < 0.55 or v < 0.5:
        return False
    return 0.45 < h < 0.55


def edit_looks_like_blotch(before: Image.Image, after: Image.Image, pts: list[tuple[int, int]]) -> bool:
    """Reject flat rectangular fills / neon patches that read as stamps, not object edits."""
    changed = changed_pixels(before, after, pts)
    if len(changed) < 40:
        return True
    xs = [p[0] for p in changed]
    ys = [p[1] for p in changed]
    bw = max(xs) - min(xs) + 1
    bh = max(ys) - min(ys) + 1
    fill = len(changed) / max(1, bw * bh)
    # Near-solid rectangle of change with weak silhouette → blotch.
    if fill > 0.78 and bw * bh > 2200:
        return True
    pa, pb = before.load(), after.load()
    neon = 0
    for x, y in changed[::2]:
        for c in (pa[x, y], pb[x, y]):
            h, s, v = colorsys.rgb_to_hsv(c[0] / 255.0, c[1] / 255.0, c[2] / 255.0)
            if _is_neon_hsv(h, s, v):
                neon += 1
                break
    if neon > max(10, len(changed) // 10):
        return True
    return False


def curated_desk_pair(base: Image.Image) -> tuple[Image.Image, Image.Image]:
    """
    Hand-authored classic diffs for the office desk scene.
    Returns left/right only — hitboxes are always derived later from real pixel diffs.
    """
    left = base.copy()
    right = base.copy()
    lp, rp = left.load(), right.load()

    def flood(im_pix, x0: int, y0: int, tol: int, bounds: tuple[int, int, int, int]) -> list[tuple[int, int]]:
        x_lo, y_lo, x_hi, y_hi = bounds
        seed = im_pix[x0, y0]
        seen = {(x0, y0)}
        stack = [(x0, y0)]
        pts: list[tuple[int, int]] = []
        while stack:
            x, y = stack.pop()
            if not (x_lo <= x <= x_hi and y_lo <= y <= y_hi):
                continue
            c = im_pix[x, y]
            if abs(c[0] - seed[0]) + abs(c[1] - seed[1]) + abs(c[2] - seed[2]) > tol:
                continue
            pts.append((x, y))
            for nx, ny in neighbors4(x, y):
                if (nx, ny) not in seen:
                    seen.add((nx, ny))
                    stack.append((nx, ny))
        return pts

    def recolor(pts: list[tuple[int, int]], pix, hue: float) -> None:
        for x, y in pts:
            r, g, b = pix[x, y]
            if (r + g + b) / 3 < 35:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s < 0.18:
                continue
            rr, gg, bb = colorsys.hsv_to_rgb(hue, min(1.0, max(s, 0.5)), v)
            pix[x, y] = (int(rr * 255), int(gg * 255), int(bb * 255))

    # 1) Mug: red → blue on right.
    recolor(flood(rp, 280, 300, 55, (248, 275, 320, 330)), rp, 0.60)

    # 2) Top book only (keep flood off the yellow curtain above the stack).
    top = flood(rp, 560, 278, 40, (552, 268, 630, 305))
    top = [p for p in top if rp[p[0], p[1]][0] > 150 and rp[p[0], p[1]][1] < 120]
    recolor(top, rp, 0.33)

    # 3) Bottom green book → purple on right.
    bottom = [
        (x, y)
        for y in range(325, 355)
        for x in range(555, 635)
        if rp[x, y][1] > 100 and rp[x, y][1] > rp[x, y][0] and rp[x, y][1] > rp[x, y][2]
    ]
    recolor(bottom, rp, 0.75)

    # 4) Remove left cloud on left picture.
    cloud = [
        (x, y)
        for y in range(35, 100)
        for x in range(255, 345)
        if lp[x, y][0] > 190 and lp[x, y][1] > 220 and lp[x, y][2] > 230
    ]
    sky = lp[300, 120]
    for x, y in expand_with_outlines(cloud, lp, rounds=1) if cloud else []:
        lp[x, y] = sky

    # 5) Remove steam on right (clear “missing” detail above the mug).
    steam = [
        (x, y)
        for y in range(248, 272)
        for x in range(255, 300)
        if rp[x, y][0] > 215 and rp[x, y][1] > 205 and rp[x, y][2] > 195
    ]
    for x, y in steam:
        rp[x, y] = rp[clamp(x + 14, 0, W - 1), clamp(y + 10, 0, H - 1)]

    return left, right


def fill_looks_neon(fill: tuple[int, int, int], samples: list[tuple[int, int, int]]) -> bool:
    """Reject fills that invent neon cyan/magenta blotches unlike the neighbourhood."""
    if not samples:
        return False
    fr, fg, fb = fill
    fsat = sat_of(fill)
    mean = (
        sum(c[0] for c in samples) / len(samples),
        sum(c[1] for c in samples) / len(samples),
        sum(c[2] for c in samples) / len(samples),
    )
    dist = abs(fr - mean[0]) + abs(fg - mean[1]) + abs(fb - mean[2])
    # Strong cyan/magenta with high sat and far from local mean → smudge.
    if fsat > 0.35 and dist > 120:
        return True
    if fg > fr + 40 and fg > fb + 20 and fsat > 0.28 and dist > 90:
        return True
    return False


def erase_object(im: Image.Image, pts: list[tuple[int, int]]) -> bool:
    """Remove an object with a hard silhouette fill. Returns False if fill would look like a smudge."""
    pix = im.load()
    full = expand_with_outlines(pts, pix, rounds=3)
    mask = set(full)
    samples = ring_samples(pix, mask, full)
    fill = sample_background(pix, mask, full)
    if fill_looks_neon(fill, samples):
        return False
    for x, y in full:
        pix[x, y] = fill
    return True


def recolor_object(im: Image.Image, pts: list[tuple[int, int]], shift: float) -> None:
    """Uniform hue shift across the whole object — reads as a real colour change."""
    pix = im.load()
    full = expand_with_outlines(pts, pix, rounds=1)
    for x, y in full:
        r0, g0, b0 = pix[x, y]
        if (r0 + g0 + b0) / 3.0 < 40:
            continue
        h, s, v = colorsys.rgb_to_hsv(r0 / 255.0, g0 / 255.0, b0 / 255.0)
        if s < 0.08 and v > 0.9:
            continue
        # Skip near-grey wood/floor tones — hue shift turns them into neon smudges.
        if s < 0.18 and v < 0.75:
            continue
        h2 = (h + shift) % 1.0
        s2 = min(1.0, max(s, 0.4) * 1.1)
        rr, gg, bb = colorsys.hsv_to_rgb(h2, s2, v)
        pix[x, y] = (int(rr * 255), int(gg * 255), int(bb * 255))


def hide_part(im: Image.Image, pts: list[tuple[int, int]], rng: random.Random) -> list[tuple[int, int]] | None:
    """Erase a coherent chunk of a larger object (half a cloud / part of a facade)."""
    if len(pts) < 500:
        if not erase_object(im, pts):
            return None
        return expand_with_outlines(pts, im.load())
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    cx = sum(xs) / len(xs)
    cy = sum(ys) / len(ys)
    axis = rng.choice(["x", "y"])
    keep_high = rng.random() < 0.5
    if axis == "x":
        part = [p for p in pts if (p[0] >= cx) == keep_high]
    else:
        part = [p for p in pts if (p[1] >= cy) == keep_high]
    if len(part) < 160:
        part = pts
    if not erase_object(im, part):
        return None
    return expand_with_outlines(part, im.load())


def bbox_hitbox(pts: list[tuple[int, int]]) -> dict:
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    # Pad so finger taps on the object edge still count.
    pad = 14
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(W - 1, x1 + pad)
    y1 = min(H - 1, y1 + pad)
    cx = (x0 + x1) / 2 / W
    cy = (y0 + y1) / 2 / W
    hw = max(MIN_HW, (x1 - x0) / 2 / W + 0.012)
    hh = max(MIN_HW, (y1 - y0) / 2 / W + 0.012)
    hw = min(hw, 0.16)
    hh = min(hh, 0.16)
    x = min(1 - hw, max(hw, cx))
    y = min(ASPECT - hh, max(hh, cy))
    return {"x": round(x, 4), "y": round(y, 4), "hw": round(hw, 4), "hh": round(hh, 4)}


def changed_pixels(a: Image.Image, b: Image.Image, seed_pts: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Pixels that actually differ near the edit — used for tight hitboxes."""
    pa, pb = a.load(), b.load()
    xs = [p[0] for p in seed_pts]
    ys = [p[1] for p in seed_pts]
    x0, x1 = max(0, min(xs) - 10), min(W - 1, max(xs) + 10)
    y0, y1 = max(0, min(ys) - 10), min(H - 1, max(ys) + 10)
    out: list[tuple[int, int]] = []
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            ca, cb = pa[x, y], pb[x, y]
            if abs(ca[0] - cb[0]) + abs(ca[1] - cb[1]) + abs(ca[2] - cb[2]) > 28:
                out.append((x, y))
    return out or seed_pts


def hitbox_cover(box: dict, changed: list[tuple[int, int]]) -> float:
    if not changed:
        return 0.0
    x0 = (box["x"] - box["hw"]) * W
    x1 = (box["x"] + box["hw"]) * W
    y0 = (box["y"] - box["hh"]) * W
    y1 = (box["y"] + box["hh"]) * W
    inside = sum(1 for x, y in changed if x0 <= x <= x1 and y0 <= y <= y1)
    return inside / len(changed)


def apply_edit(
    base: Image.Image,
    obj: dict,
    rng: random.Random,
    *,
    relaxed: bool = False,
) -> tuple[Image.Image, list[tuple[int, int]], str] | None:
    """Prefer whole-object missing edits; fall back to clean recolours of saturated props."""
    if is_surface_slice(base, obj) and not relaxed:
        return None
    if is_surface_slice(base, obj) and relaxed and obj["sat"] < 0.35:
        return None
    pix = base.load()
    busy = exterior_busy(pix, set(obj["pts"]), obj["pts"])
    compact = obj["n"] < 2800 and obj["fill"] >= 0.38
    in_sky = obj["cy"] / H < 0.30
    colourful = obj["sat"] >= (0.22 if relaxed else 0.25)

    ops: list[tuple[str, str]] = []
    if in_sky or (compact and not busy):
        ops += [("missing", "full"), ("missing", "part")]
        if colourful:
            for shift in ("0.34", "-0.30", "0.50"):
                ops.append(("color", shift))
    elif compact and colourful and not busy:
        ops.append(("missing", "full"))
        for shift in ("0.36", "-0.30", "0.52"):
            ops.append(("color", shift))
    elif compact and colourful:
        # Busy mid-ground: recolour only (erase becomes a flat stamp).
        for shift in ("0.36", "-0.30", "0.52", "-0.44"):
            ops.append(("color", shift))
        if relaxed:
            ops.append(("missing", "part"))
    elif relaxed and colourful and obj["n"] < 3200:
        for shift in ("0.38", "-0.32", "0.55"):
            ops.append(("color", shift))
    else:
        # Low-sat or sprawling: skip — better fewer clean diffs than smudges.
        return None

    for kind, spec in ops:
        trial = base.copy()
        if kind == "missing" and spec == "part":
            edited_pts = hide_part(trial, obj["pts"], rng)
            if edited_pts is None:
                continue
        elif kind == "missing":
            if not erase_object(trial, obj["pts"]):
                continue
            edited_pts = expand_with_outlines(obj["pts"], trial.load(), rounds=3)
        else:
            recolor_object(trial, obj["pts"], float(spec))
            edited_pts = expand_with_outlines(obj["pts"], trial.load(), rounds=1)
        if playable_mad(trial, base, edited_pts) < MIN_MAD:
            continue
        if edit_looks_like_blotch(base, trial, edited_pts):
            continue
        return trial, edited_pts, kind
    return None


def space_fallback_objects(im: Image.Image, need: int, used: list[dict], rng: random.Random) -> list[dict]:
    """Space scenes only: erase compact bright stars/nebula blobs — never indoor floor disks."""
    pix = im.load()
    out: list[dict] = []
    slots = [
        (0.18, 0.16),
        (0.50, 0.12),
        (0.82, 0.18),
        (0.30, 0.32),
        (0.68, 0.30),
        (0.48, 0.42),
    ]
    rng.shuffle(slots)
    for nx, ny in slots:
        if len(out) >= need:
            break
        cx, cy = int(nx * W), int(ny * H)
        if any(math.hypot(cx - u["cx"], cy - u["cy"]) < 110 for u in used + out):
            continue
        r = rng.randint(18, 28)
        pts = [
            (x, y)
            for y in range(cy - r, cy + r + 1)
            for x in range(cx - r, cx + r + 1)
            if 0 <= x < W and 0 <= y < H and (x - cx) ** 2 + (y - cy) ** 2 <= r * r
        ]
        lum = [sum(pix[x, y]) / 3 for x, y in pts[::2]]
        if not lum or (sum(lum) / len(lum)) < 55:
            continue
        out.append({"pts": pts, "cx": float(cx), "cy": float(cy), "n": len(pts), "score": 0.15, "sat": 0.35, "fill": 0.75})
    return out


def overlaps(a: dict, b: dict) -> bool:
    return abs(a["x"] - b["x"]) < a["hw"] + b["hw"] and abs(a["y"] - b["y"]) < a["hh"] + b["hh"]


def fit_hitbox(box: dict, kept: list[dict], changed: list[tuple[int, int]]) -> dict | None:
    """
    Shrink a hitbox around its own centre until it no longer overlaps kept boxes.
    Never slide the centre — that used to leave visible diffs untappable.
    """
    d = dict(box)
    for _ in range(10):
        d["hw"] = max(MIN_HW, min(d["hw"], 0.16))
        d["hh"] = max(MIN_HW, min(d["hh"], 0.16))
        d["x"] = min(1 - d["hw"], max(d["hw"], d["x"]))
        d["y"] = min(ASPECT - d["hh"], max(d["hh"], d["y"]))
        if any(overlaps(d, k) for k in kept):
            d["hw"] = max(MIN_HW, d["hw"] * 0.82)
            d["hh"] = max(MIN_HW, d["hh"] * 0.82)
            continue
        if hitbox_cover(d, changed) < MIN_COVER:
            return None
        return {
            **d,
            "x": round(d["x"], 4),
            "y": round(d["y"], 4),
            "hw": round(d["hw"], 4),
            "hh": round(d["hh"], 4),
        }
    return None


def _try_add_diff(
    left: Image.Image,
    right: Image.Image,
    obj: dict,
    diffs: list[dict],
    rng: random.Random,
    *,
    relaxed: bool,
) -> tuple[Image.Image, Image.Image, bool]:
    if len(diffs) >= DIFF_COUNT:
        return left, right, False
    i = len(diffs)
    side_right = i % 2 == 0
    target = right if side_right else left
    other = left if side_right else right
    applied = apply_edit(target, obj, rng, relaxed=relaxed)
    if applied is None:
        return left, right, False
    edited, edited_pts, kind = applied
    if playable_mad(edited, other, edited_pts) < MIN_MAD:
        return left, right, False
    trial_left = edited if not side_right else left
    trial_right = edited if side_right else right
    changed = changed_pixels(trial_left, trial_right, edited_pts)
    if len(changed) < 40:
        return left, right, False
    box = bbox_hitbox(changed)
    fitted = fit_hitbox({"id": f"d{i + 1}", "kind": kind, **box}, diffs, changed)
    if fitted is None:
        return left, right, False
    if side_right:
        right = edited
    else:
        left = edited
    diffs.append(fitted)
    return left, right, True


def make_pair(base: Image.Image, seed: int, category: str) -> tuple[Image.Image, Image.Image]:
    """Paint object-level edits. Hitboxes are derived later from final pixel diffs."""
    rng = random.Random(seed)
    left = base.copy()
    right = base.copy()
    cands = find_objects(base)
    objs = pick_objects(cands, DIFF_COUNT + 10, rng)
    if category == "space" and len(objs) < DIFF_COUNT:
        objs.extend(space_fallback_objects(base, DIFF_COUNT + 4 - len(objs), objs, rng))

    diffs: list[dict] = []
    used_centers: list[tuple[float, float]] = []
    for obj in objs:
        left, right, ok = _try_add_diff(left, right, obj, diffs, rng, relaxed=False)
        if ok:
            used_centers.append((obj["cx"], obj["cy"]))
        if len(diffs) >= DIFF_COUNT:
            break

    if len(diffs) < DIFF_COUNT:
        more = pick_objects(cands, DIFF_COUNT + 16, random.Random(seed + 17))
        for obj in more + [o for o in cands if o not in objs][:40]:
            if any(math.hypot(obj["cx"] - cx, obj["cy"] - cy) < 70 for cx, cy in used_centers):
                continue
            left, right, ok = _try_add_diff(left, right, obj, diffs, rng, relaxed=True)
            if ok:
                used_centers.append((obj["cx"], obj["cy"]))
            if len(diffs) >= DIFF_COUNT:
                break
    return left, right


def diff_blobs(left: Image.Image, right: Image.Image, *, min_area: int = 80) -> list[list[tuple[int, int]]]:
    """Connected components of pixels that actually differ between the two pictures."""
    pa, pb = left.load(), right.load()
    changed = [[False] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            a, b = pa[x, y], pb[x, y]
            if abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2]) > 30:
                changed[y][x] = True
    visited = [[False] * W for _ in range(H)]
    blobs: list[list[tuple[int, int]]] = []
    for y0 in range(H):
        for x0 in range(W):
            if not changed[y0][x0] or visited[y0][x0]:
                continue
            stack = [(x0, y0)]
            visited[y0][x0] = True
            pts: list[tuple[int, int]] = []
            while stack:
                x, y = stack.pop()
                pts.append((x, y))
                for nx, ny in neighbors4(x, y):
                    if changed[ny][nx] and not visited[ny][nx]:
                        visited[ny][nx] = True
                        stack.append((nx, ny))
            if len(pts) >= min_area:
                blobs.append(pts)
    blobs.sort(key=len, reverse=True)
    return blobs


def heal_noise(left: Image.Image, right: Image.Image, *, max_noise: int = 70) -> None:
    """Erase tiny JPEG/artifact blobs so identical areas stay identical."""
    pa, pb = left.load(), right.load()
    for blob in diff_blobs(left, right, min_area=1):
        if len(blob) > max_noise:
            continue
        # Copy left → right for noise on right (and vice-versa average).
        for x, y in blob:
            pb[x, y] = pa[x, y]


def kind_for_blob(left: Image.Image, right: Image.Image, pts: list[tuple[int, int]]) -> str:
    pa, pb = left.load(), right.load()
    # Rough heuristic: large mean chroma change → color; else missing/shape.
    shifts = 0
    for x, y in pts[:: max(1, len(pts) // 40)]:
        a, b = pa[x, y], pb[x, y]
        ha, sa, _ = colorsys.rgb_to_hsv(a[0] / 255, a[1] / 255, a[2] / 255)
        hb, sb, _ = colorsys.rgb_to_hsv(b[0] / 255, b[1] / 255, b[2] / 255)
        if abs(ha - hb) > 0.12 and max(sa, sb) > 0.25:
            shifts += 1
    return "color" if shifts >= 3 else "missing"


def blob_looks_like_blemish(left: Image.Image, right: Image.Image, pts: list[tuple[int, int]]) -> bool:
    """Thin neon streaks / flat stamps — not classic spot-the-difference object edits."""
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    bw = max(xs) - min(xs) + 1
    bh = max(ys) - min(ys) + 1
    if max(bw, bh) / max(1, min(bw, bh)) >= 6.0:
        return True
    fill = len(pts) / max(1, bw * bh)
    pa, pb = left.load(), right.load()
    neon = 0
    for x, y in pts[:: max(1, len(pts) // 50)]:
        for c in (pa[x, y], pb[x, y]):
            h, s, v = colorsys.rgb_to_hsv(c[0] / 255.0, c[1] / 255.0, c[2] / 255.0)
            if _is_neon_hsv(h, s, v):
                neon += 1
                break
    if neon >= max(4, len(pts) // 25):
        return True
    # Near-solid bright rectangle on a busy shelf → stamp, not a missing prop.
    if fill > 0.85 and bw * bh > 1800 and min(bw, bh) < 28:
        return True
    return False


def finalize_pair(left: Image.Image, right: Image.Image) -> tuple[Image.Image, Image.Image, list[dict]]:
    """
    Source of truth for gameplay:
    - JPEG-roundtrip so shipped pixels match what we measure
    - heal tiny noise (no phantom blemishes)
    - one hitbox per remaining real difference blob
    Every visible change is tappable; nothing else is.
    """
    left = jpeg_roundtrip(left)
    right = jpeg_roundtrip(right)
    heal_noise(left, right, max_noise=70)
    left = jpeg_roundtrip(left)
    right = jpeg_roundtrip(right)

    # Drop blemish-like streaks before selecting playable diffs.
    pa, pb = left.load(), right.load()
    for blob in diff_blobs(left, right, min_area=40):
        if blob_looks_like_blemish(left, right, blob):
            for x, y in blob:
                pb[x, y] = pa[x, y]
    left = jpeg_roundtrip(left)
    right = jpeg_roundtrip(right)

    blobs = diff_blobs(left, right, min_area=90)
    # Keep the largest well-spaced blobs up to DIFF_COUNT; revert the rest so
    # leftover edits never appear as untappable marks.
    kept_blobs: list[list[tuple[int, int]]] = []
    for blob in blobs:
        cx = sum(p[0] for p in blob) / len(blob)
        cy = sum(p[1] for p in blob) / len(blob)
        # Prefer larger blobs: if a new blob is close to a smaller kept one, replace it.
        conflict = None
        for i, k in enumerate(kept_blobs):
            kx = sum(p[0] for p in k) / len(k)
            ky = sum(p[1] for p in k) / len(k)
            if math.hypot(cx - kx, cy - ky) < 80:
                conflict = i
                break
        if conflict is not None:
            if len(blob) <= len(kept_blobs[conflict]):
                pb = right.load()
                pa = left.load()
                for x, y in blob:
                    pb[x, y] = pa[x, y]
                continue
            # Replace smaller neighbour — heal the old blob.
            pb = right.load()
            pa = left.load()
            for x, y in kept_blobs[conflict]:
                pb[x, y] = pa[x, y]
            kept_blobs[conflict] = blob
            continue
        kept_blobs.append(blob)
        if len(kept_blobs) >= DIFF_COUNT:
            break
    # Revert any remaining lower-ranked blobs.
    kept_set = {id(b) for b in kept_blobs}
    for blob in blobs:
        if id(blob) in kept_set:
            continue
        pb = right.load()
        pa = left.load()
        for x, y in blob:
            pb[x, y] = pa[x, y]

    left = jpeg_roundtrip(left)
    right = jpeg_roundtrip(right)
    # Rebuild from the cleaned images so hitboxes match shipped art exactly.
    final_blobs = diff_blobs(left, right, min_area=90)
    diffs: list[dict] = []
    for blob in final_blobs[:DIFF_COUNT]:
        box = bbox_hitbox(blob)
        kind = kind_for_blob(left, right, blob)
        fitted = fit_hitbox({"id": f"d{len(diffs)+1}", "kind": kind, **box}, diffs, blob)
        if fitted is None:
            # Force a covering box even if overlaps slightly — prefer tappability.
            fitted = {
                "id": f"d{len(diffs)+1}",
                "kind": kind,
                "x": box["x"],
                "y": box["y"],
                "hw": box["hw"],
                "hh": box["hh"],
            }
            if any(overlaps(fitted, k) for k in diffs):
                # Shrink in place until free or give up and skip (then heal blob).
                ok = False
                d = dict(fitted)
                for _ in range(8):
                    d["hw"] = max(MIN_HW, d["hw"] * 0.85)
                    d["hh"] = max(MIN_HW, d["hh"] * 0.85)
                    if not any(overlaps(d, k) for k in diffs) and hitbox_cover(d, blob) >= MIN_COVER:
                        fitted = {**d, "x": round(d["x"], 4), "y": round(d["y"], 4), "hw": round(d["hw"], 4), "hh": round(d["hh"], 4)}
                        ok = True
                        break
                if not ok:
                    pb = right.load()
                    pa = left.load()
                    for x, y in blob:
                        pb[x, y] = pa[x, y]
                    continue
        diffs.append(fitted)

    # Final heal of anything still different but untapped.
    covered = []
    for d in diffs:
        covered.append(d)
    still = diff_blobs(left, right, min_area=40)
    pa, pb = left.load(), right.load()
    for blob in still:
        cx = sum(p[0] for p in blob) / len(blob) / W
        cy = sum(p[1] for p in blob) / len(blob) / W
        if any(in_box(d, cx, cy) for d in diffs):
            continue
        for x, y in blob:
            pb[x, y] = pa[x, y]

    left = jpeg_roundtrip(left)
    right = jpeg_roundtrip(right)
    return left, right, diffs


def in_box(d: dict, x: float, y: float) -> bool:
    return abs(x - d["x"]) <= d["hw"] + 0.01 and abs(y - d["y"]) <= d["hh"] + 0.01


def sync_hi_pack(en_items: list[dict]) -> None:
    """Keep Hindi titles, copy bake geometry/URLs from English pack."""
    existing: dict[str, dict] = {}
    if OUT_PACK_HI.exists():
        raw = json.loads(OUT_PACK_HI.read_text(encoding="utf-8"))
        for item in raw.get("items", []):
            existing[item["id"].removesuffix(".hi")] = item

    hi_items = []
    for item in en_items:
        base_id = item["id"]
        title = item["attributes"]["title"]
        hi_title = HI_TITLES.get(title, title)
        prev = existing.get(base_id)
        if prev and isinstance(prev.get("attributes"), dict) and isinstance(prev["attributes"].get("title"), str):
            # Preserve a previously localized title when we don't have a mapping.
            if title not in HI_TITLES:
                hi_title = prev["attributes"]["title"]
        hi_items.append(
            {
                **item,
                "id": f"{base_id}.hi",
                "attributes": {**item["attributes"], "title": hi_title},
            }
        )
    OUT_PACK_HI.write_text(
        json.dumps({"packId": "spot_pair", "title": "Spot the Difference scenes", "items": hi_items}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print("wrote", OUT_PACK_HI, len(hi_items))


def main() -> None:
    items = []
    cat_counts: dict[str, int] = {}
    for key, cat, title in SCENES:
        src = ASSETS / f"{key}.jpg"
        if not src.exists():
            raise SystemExit(f"missing base art {src}")
        base = Image.open(src).convert("RGB").resize((W, H), Image.Resampling.LANCZOS)
        if key == "shapes_desk_1":
            left, right = curated_desk_pair(base)
        else:
            left, right = make_pair(base, stable_seed(key + ":v11-sync"), cat)
        left, right, diffs = finalize_pair(left, right)
        if len(diffs) < 3:
            # Retry with a different seed if finalize healed too aggressively.
            left, right = make_pair(base, stable_seed(key + ":v11-retry"), cat)
            left, right, diffs = finalize_pair(left, right)
        if len(diffs) < 3:
            raise SystemExit(f"{key}: only {len(diffs)} diffs after finalize")
        left_path = ASSETS / f"{key}_left.jpg"
        right_path = ASSETS / f"{key}_right.jpg"
        left.save(left_path, "JPEG", quality=92)
        right.save(right_path, "JPEG", quality=92)
        # Hitboxes must match the exact bytes we ship (one more JPEG pass).
        left = Image.open(left_path).convert("RGB")
        right = Image.open(right_path).convert("RGB")
        left, right, diffs = finalize_pair(left, right)
        if len(diffs) < 3:
            raise SystemExit(f"{key}: only {len(diffs)} diffs after ship-sync")
        left.save(left_path, "JPEG", quality=92)
        right.save(right_path, "JPEG", quality=92)
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
        print(f"ok {key} diffs={len(diffs)} kinds={[d['kind'] for d in diffs]}")

    OUT_PACK.write_text(
        json.dumps({"packId": "spot_pair", "title": "Spot the Difference scenes", "items": items}, indent=2) + "\n",
        encoding="utf-8",
    )
    print("wrote", OUT_PACK, len(items))
    sync_hi_pack(items)


if __name__ == "__main__":
    main()
