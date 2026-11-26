"""
Bake left/right variants from apps/mobile/assets/spot-pairs/*.jpg (base scenes),
write *_left.jpg / *_right.jpg, and rewrite spot_pair.json with asset:spot/ URLs
and hitboxes.

Differences must look like classic spot-the-difference edits: a whole object or
part missing, or a clean recolour of an object — never soft circular colour
smudges / stamps that read as UI glitches.
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
MIN_HW = 0.055
# Every authored change is playable — bake this many object-level edits per scene.
DIFF_COUNT = 5
MIN_MAD = 12.0

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


def find_objects(im: Image.Image) -> list[dict]:
    """Colour-quantize then keep compact mid-size connected components (cars, clouds, props…)."""
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
            if n < 220 or n > 4200:
                continue
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            x0b, x1b = min(xs), max(xs)
            y0b, y1b = min(ys), max(ys)
            bw, bh = x1b - x0b + 1, y1b - y0b + 1
            fill = n / (bw * bh)
            if fill < 0.30 or bw > 240 or bh > 200:
                continue
            edge = sum(1 for x, y in pts if x < 2 or y < 2 or x >= W - 2 or y >= H - 2)
            if edge > n * 0.06:
                continue
            r, g, b = color
            mx, mn = max(r, g, b), min(r, g, b)
            sat = (mx - mn) / 255.0
            cx = sum(xs) / n
            cy = sum(ys) / n
            # Prefer colourful, compact props over flat wall slices.
            score = fill * 1.2 + sat * 0.9 + min(1.0, n / 1600) * 0.5 - (bw * bh) / 80_000
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
    pool = cands[: max(count * 10, 30)]
    rng.shuffle(pool)
    pool.sort(key=lambda o: o["score"] + rng.random() * 0.25, reverse=True)
    picked: list[dict] = []
    min_dist = 130.0
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
            if any(math.hypot(obj["cx"] - p["cx"], obj["cy"] - p["cy"]) < 95 for p in picked):
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
                if (r + g + b) / 3.0 <= 140:
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
    # Prefer the band under/behind the object (ground / sky continuity).
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


def erase_object(im: Image.Image, pts: list[tuple[int, int]]) -> None:
    """Remove an object with a hard silhouette fill matching the dominant surroundings."""
    pix = im.load()
    full = expand_with_outlines(pts, pix, rounds=3)
    mask = set(full)
    fill = sample_background(pix, mask, full)
    for x, y in full:
        pix[x, y] = fill


def recolor_object(im: Image.Image, pts: list[tuple[int, int]], shift: float) -> None:
    """Uniform hue shift across the whole object — reads as a real colour change."""
    pix = im.load()
    full = expand_with_outlines(pts, pix, rounds=1)
    for x, y in full:
        r0, g0, b0 = pix[x, y]
        # Leave pure black outlines alone so the shape stays crisp.
        if (r0 + g0 + b0) / 3.0 < 40:
            continue
        h, s, v = colorsys.rgb_to_hsv(r0 / 255.0, g0 / 255.0, b0 / 255.0)
        if s < 0.05 and v > 0.92:
            continue
        h2 = (h + shift) % 1.0
        s2 = min(1.0, max(s, 0.35) * 1.15)
        rr, gg, bb = colorsys.hsv_to_rgb(h2, s2, v)
        pix[x, y] = (int(rr * 255), int(gg * 255), int(bb * 255))


def hide_part(im: Image.Image, pts: list[tuple[int, int]], rng: random.Random) -> list[tuple[int, int]]:
    """Erase a coherent chunk of a larger object (half a cloud / part of a facade)."""
    if len(pts) < 500:
        erase_object(im, pts)
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
    erase_object(im, part)
    return expand_with_outlines(part, im.load())


def bbox_hitbox(pts: list[tuple[int, int]]) -> dict:
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    # Pad so finger taps on the object edge still count.
    pad = 10
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(W - 1, x1 + pad)
    y1 = min(H - 1, y1 + pad)
    cx = (x0 + x1) / 2 / W
    cy = (y0 + y1) / 2 / W
    hw = max(MIN_HW, (x1 - x0) / 2 / W + 0.01)
    hh = max(MIN_HW, (y1 - y0) / 2 / W + 0.01)
    # Clamp inside playfield [0,1] x [0, ASPECT].
    hw = min(hw, 0.14)
    hh = min(hh, 0.14)
    x = min(1 - hw, max(hw, cx))
    y = min(ASPECT - hh, max(hh, cy))
    return {"x": round(x, 4), "y": round(y, 4), "hw": round(hw, 4), "hh": round(hh, 4)}


def changed_pixels(a: Image.Image, b: Image.Image, seed_pts: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Pixels that actually differ near the edit — used for tight hitboxes."""
    pa, pb = a.load(), b.load()
    xs = [p[0] for p in seed_pts]
    ys = [p[1] for p in seed_pts]
    x0, x1 = max(0, min(xs) - 8), min(W - 1, max(xs) + 8)
    y0, y1 = max(0, min(ys) - 8), min(H - 1, max(ys) + 8)
    out: list[tuple[int, int]] = []
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            ca, cb = pa[x, y], pb[x, y]
            if abs(ca[0] - cb[0]) + abs(ca[1] - cb[1]) + abs(ca[2] - cb[2]) > 28:
                out.append((x, y))
    return out or seed_pts


def apply_edit(base: Image.Image, obj: dict, rng: random.Random) -> tuple[Image.Image, list[tuple[int, int]], str]:
    """Prefer whole-object missing edits; fall back to clean recolours."""
    pix = base.load()
    busy = exterior_busy(pix, set(obj["pts"]), obj["pts"])
    compact = obj["n"] < 3000 and obj["fill"] >= 0.40
    in_sky = obj["cy"] / W < 0.28
    # Sky props and compact shapes → remove first. Busy mid-ground → recolour first.
    ops: list[tuple[str, str]] = []
    if in_sky or (compact and not busy):
        ops += [("missing", "full"), ("missing", "part")]
        for shift in ("0.34", "-0.30", "0.50"):
            ops.append(("color", shift))
    elif compact:
        ops.append(("missing", "full"))
        for shift in ("0.36", "-0.30", "0.52", "-0.44"):
            ops.append(("color", shift))
        ops.append(("missing", "part"))
    else:
        for shift in ("0.36", "-0.30", "0.52", "-0.44"):
            ops.append(("color", shift))
        ops += [("missing", "part"), ("missing", "full")]

    for kind, spec in ops:
        trial = base.copy()
        if kind == "missing" and spec == "part":
            edited_pts = hide_part(trial, obj["pts"], rng)
        elif kind == "missing":
            erase_object(trial, obj["pts"])
            edited_pts = expand_with_outlines(obj["pts"], trial.load(), rounds=3)
        else:
            recolor_object(trial, obj["pts"], float(spec))
            edited_pts = expand_with_outlines(obj["pts"], trial.load(), rounds=1)
        if playable_mad(trial, base, edited_pts) >= MIN_MAD:
            return trial, edited_pts, kind
    trial = base.copy()
    recolor_object(trial, obj["pts"], 0.42)
    return trial, expand_with_outlines(obj["pts"], trial.load(), rounds=1), "color"


def disk_fallback_objects(im: Image.Image, need: int, used: list[dict], rng: random.Random) -> list[dict]:
    """Last resort for sparse scenes: high-contrast patches treated as hard disks to erase."""
    pix = im.load()
    out: list[dict] = []
    slots = [
        (0.18, 0.18),
        (0.50, 0.14),
        (0.82, 0.20),
        (0.28, 0.40),
        (0.70, 0.38),
        (0.48, 0.48),
        (0.35, 0.28),
        (0.62, 0.26),
    ]
    rng.shuffle(slots)
    for nx, ny in slots:
        if len(out) >= need:
            break
        cx, cy = int(nx * W), int(ny * W)
        if any(math.hypot(cx - u["cx"], cy - u["cy"]) < 100 for u in used + out):
            continue
        r = rng.randint(22, 34)
        pts = [(x, y) for y in range(cy - r, cy + r + 1) for x in range(cx - r, cx + r + 1) if 0 <= x < W and 0 <= y < H and (x - cx) ** 2 + (y - cy) ** 2 <= r * r]
        # Skip empty-looking sky washes with almost no local contrast.
        lum = [sum(pix[x, y]) / 3 for x, y in pts[::3]]
        if not lum:
            continue
        mean = sum(lum) / len(lum)
        var = sum((v - mean) ** 2 for v in lum) / len(lum)
        if var < 40 and len(out) + len(used) < need:
            # Still allow on very flat space scenes after first few real objects.
            pass
        out.append({"pts": pts, "cx": float(cx), "cy": float(cy), "n": len(pts), "score": 0.1, "sat": 0.2, "fill": 0.7})
    return out


def make_pair(base: Image.Image, seed: int) -> tuple[Image.Image, Image.Image, list[dict]]:
    rng = random.Random(seed)
    left = base.copy()
    right = base.copy()
    cands = find_objects(base)
    objs = pick_objects(cands, DIFF_COUNT + 3, rng)
    if len(objs) < DIFF_COUNT:
        objs.extend(disk_fallback_objects(base, DIFF_COUNT + 3 - len(objs), objs, rng))

    diffs: list[dict] = []
    for obj in objs:
        if len(diffs) >= DIFF_COUNT:
            break
        i = len(diffs)
        side_right = i % 2 == 0
        target = right if side_right else left
        other = left if side_right else right
        edited, edited_pts, kind = apply_edit(target, obj, rng)
        if playable_mad(edited, other, edited_pts) < MIN_MAD:
            edited = target.copy()
            erase_object(edited, obj["pts"])
            edited_pts = expand_with_outlines(obj["pts"], edited.load(), rounds=3)
            kind = "missing"
            if playable_mad(edited, other, edited_pts) < MIN_MAD:
                continue
        # Tentatively apply, derive hitbox against the other side, then keep only if selectable.
        trial_left = edited if not side_right else left
        trial_right = edited if side_right else right
        changed = changed_pixels(trial_left, trial_right, edited_pts)
        box = bbox_hitbox(changed)
        fitted = fit_hitbox({"id": f"d{i + 1}", "kind": kind, **box}, diffs)
        if fitted is None:
            continue
        if side_right:
            right = edited
        else:
            left = edited
        diffs.append(fitted)
    return left, right, diffs


def overlaps(a: dict, b: dict) -> bool:
    return abs(a["x"] - b["x"]) < a["hw"] + b["hw"] and abs(a["y"] - b["y"]) < a["hh"] + b["hh"]


def fit_hitbox(box: dict, kept: list[dict]) -> dict | None:
    """Shrink / nudge a hitbox until it no longer overlaps kept boxes."""
    d = dict(box)
    for _ in range(8):
        if not any(overlaps(d, k) for k in kept):
            # Clamp inside the playfield after any nudge.
            d["hw"] = max(MIN_HW, min(d["hw"], 0.12))
            d["hh"] = max(MIN_HW, min(d["hh"], 0.12))
            d["x"] = min(1 - d["hw"], max(d["hw"], d["x"]))
            d["y"] = min(ASPECT - d["hh"], max(d["hh"], d["y"]))
            if not any(overlaps(d, k) for k in kept):
                return {**d, "x": round(d["x"], 4), "y": round(d["y"], 4), "hw": round(d["hw"], 4), "hh": round(d["hh"], 4)}
        d["hw"] = max(MIN_HW, d["hw"] * 0.82)
        d["hh"] = max(MIN_HW, d["hh"] * 0.82)
        d["x"] = min(1 - d["hw"], d["x"] + 0.03)
        d["y"] = min(ASPECT - d["hh"], d["y"] + 0.025)
    return None


def main() -> None:
    items = []
    cat_counts: dict[str, int] = {}
    for key, cat, title in SCENES:
        src = ASSETS / f"{key}.jpg"
        if not src.exists():
            raise SystemExit(f"missing base art {src}")
        base = Image.open(src).convert("RGB").resize((W, H), Image.Resampling.LANCZOS)
        left, right, diffs = make_pair(base, stable_seed(key + ":v8-objects"))
        if len(diffs) < 3:
            raise SystemExit(f"{key}: only {len(diffs)} diffs")
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
        print(f"ok {key} diffs={len(diffs)}")

    OUT_PACK.write_text(
        json.dumps({"packId": "spot_pair", "title": "Spot the Difference scenes", "items": items}, indent=2) + "\n",
        encoding="utf-8",
    )
    print("wrote", OUT_PACK, len(items))


if __name__ == "__main__":
    main()
