"""
Build spot-the-difference left/right photo pairs from Unsplash sources,
apply authored edits, upload to catbox.moe, and write spot_pair.json.
"""
from __future__ import annotations

import json
import math
import os
import random
import ssl
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent
TMP = ROOT / "tmp"
OUT_PACK = Path(__file__).resolve().parents[3] / "apps" / "mobile" / "src" / "game" / "content" / "packs" / "spot_pair.json"
ASPECT = 0.625
W, H = 800, 500

# Stable Unsplash photo IDs (real photographs), cropped to 800x500.
SOURCES: dict[str, list[tuple[str, str]]] = {
    "shapes": [
        ("desk_1", "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&h=500&q=80"),
        ("kitchen_1", "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=800&h=500&q=80"),
        ("living_1", "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=800&h=500&q=80"),
        ("shelf_1", "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&h=500&q=80"),
    ],
    "city": [
        ("skyline_1", "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?auto=format&fit=crop&w=800&h=500&q=80"),
        ("street_1", "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=800&h=500&q=80"),
        ("night_1", "https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=800&h=500&q=80"),
        ("market_1", "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=800&h=500&q=80"),
    ],
    "garden": [
        ("flowers_1", "https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=800&h=500&q=80"),
        ("park_1", "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&w=800&h=500&q=80"),
        ("path_1", "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=800&h=500&q=80"),
        ("greenhouse_1", "https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&w=800&h=500&q=80"),
    ],
    "space": [
        ("nebula_1", "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=800&h=500&q=80"),
        ("milky_1", "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?auto=format&fit=crop&w=800&h=500&q=80"),
        ("earth_1", "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=800&h=500&q=80"),
        ("stars_1", "https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?auto=format&fit=crop&w=800&h=500&q=80"),
    ],
}

# Normalised centres (x, y) for six edit slots per scene — kept away from edges.
SLOTS = [
    (0.18, 0.20),
    (0.50, 0.16),
    (0.82, 0.22),
    (0.22, 0.42),
    (0.72, 0.40),
    (0.48, 0.50),
]


def ctx():
    return ssl.create_default_context()


def download(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 10_000:
        return
    req = urllib.request.Request(url, headers={"User-Agent": "maja-spot-pairs/1.0"})
    try:
        with urllib.request.urlopen(req, context=ctx(), timeout=60) as r:
            dest.write_bytes(r.read())
    except Exception as e:
        # picsum fallback keeps the pipeline unblocked if a source 404s
        print(f"  source failed ({e}); using picsum fallback")
        seed = abs(hash(url)) % 1000
        fb = f"https://picsum.photos/seed/{seed}/800/500"
        req = urllib.request.Request(fb, headers={"User-Agent": "maja-spot-pairs/1.0"})
        with urllib.request.urlopen(req, context=ctx(), timeout=60) as r:
            dest.write_bytes(r.read())


def load_base(url: str, cache: Path) -> Image.Image:
    download(url, cache)
    im = Image.open(cache).convert("RGB")
    return im.resize((W, H), Image.Resampling.LANCZOS)


def px(nx: float, ny: float) -> tuple[int, int]:
    return int(nx * W), int(ny * W)  # y normalised to width (game coord space)


def region_box(nx: float, ny: float, hw: float = 0.055, hh: float = 0.055) -> dict:
    return {
        "id": "",
        "x": round(nx, 4),
        "y": round(ny, 4),
        "hw": round(max(0.05, hw), 4),
        "hh": round(max(0.05, hh), 4),
    }


def clone_patch(im: Image.Image, cx: int, cy: int, r: int, ox: int, oy: int) -> None:
    """Copy a nearby patch over (cx,cy) to hide/change detail."""
    src = im.crop((cx + ox - r, cy + oy - r, cx + ox + r, cy + oy + r))
    im.paste(src, (cx - r, cy - r))


def recolor_disk(im: Image.Image, cx: int, cy: int, r: int, factor: float = 1.8) -> None:
    overlay = Image.new("RGB", im.size)
    overlay.paste(im)
    draw = ImageDraw.Draw(overlay)
    box = (cx - r, cy - r, cx + r, cy + r)
    crop = im.crop(box)
    tinted = ImageEnhance.Color(crop).enhance(factor)
    tinted = ImageEnhance.Brightness(tinted).enhance(1.25)
    mask = Image.new("L", crop.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, crop.size[0] - 1, crop.size[1] - 1), fill=255)
    overlay.paste(tinted, box[:2], mask)
    im.paste(overlay)


def add_blob(im: Image.Image, cx: int, cy: int, r: int, color: tuple[int, int, int]) -> None:
    draw = ImageDraw.Draw(im)
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)


def brighten_rect(im: Image.Image, cx: int, cy: int, hw: int, hh: int, factor: float) -> None:
    box = (cx - hw, cy - hh, cx + hw, cy + hh)
    crop = im.crop(box)
    crop = ImageEnhance.Brightness(crop).enhance(factor)
    im.paste(crop, box[:2])


def flip_patch(im: Image.Image, cx: int, cy: int, r: int) -> None:
    box = (cx - r, cy - r, cx + r, cy + r)
    crop = im.crop(box).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    im.paste(crop, box[:2])


def blur_disk(im: Image.Image, cx: int, cy: int, r: int) -> None:
    box = (cx - r, cy - r, cx + r, cy + r)
    crop = im.crop(box).filter(ImageFilter.GaussianBlur(4))
    mask = Image.new("L", crop.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, crop.size[0] - 1, crop.size[1] - 1), fill=255)
    im.paste(crop, box[:2], mask)


EDITS = [
    ("recolor", lambda im, cx, cy, r: recolor_disk(im, cx, cy, r, 2.2)),
    ("hide", lambda im, cx, cy, r: clone_patch(im, cx, cy, r, 40, 10)),
    ("blob", lambda im, cx, cy, r: add_blob(im, cx, cy, max(8, r // 2), (255, 80, 60))),
    ("bright", lambda im, cx, cy, r: brighten_rect(im, cx, cy, r, r, 1.55)),
    ("flip", lambda im, cx, cy, r: flip_patch(im, cx, cy, r)),
    ("blur", lambda im, cx, cy, r: blur_disk(im, cx, cy, r)),
]


def make_pair(base: Image.Image, seed: int) -> tuple[Image.Image, Image.Image, list[dict]]:
    rng = random.Random(seed)
    left = base.copy()
    right = base.copy()
    diffs: list[dict] = []
    edits = EDITS[:]
    rng.shuffle(edits)
    slots = SLOTS[:]
    rng.shuffle(slots)
    for i, ((nx, ny), (name, fn)) in enumerate(zip(slots, edits)):
        cx, cy = px(nx, ny)
        r = rng.randint(28, 42)
        # Apply edit to one side only so the pair truly differs.
        target = right if i % 2 == 0 else left
        fn(target, cx, cy, r)
        d = region_box(nx, ny, r / W + 0.01, r / W + 0.01)
        d["id"] = f"d{i + 1}"
        diffs.append(d)
    return left, right, diffs


def upload_image(path: Path) -> str:
    """Upload via freeimage.host public API; returns https URL on iili.io."""
    boundary = "----majaSpotBoundary7MA4YWxk"
    data = path.read_bytes()
    # Public demo key from freeimage.host docs.
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="key"\r\n\r\n'
        f"6d207e02198a847aa98d0a2a901485a5\r\n"
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="action"\r\n\r\n'
        f"upload\r\n"
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="format"\r\n\r\n'
        f"json\r\n"
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="source"; filename="{path.name}"\r\n'
        f"Content-Type: image/jpeg\r\n\r\n"
    ).encode() + data + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        "https://freeimage.host/api/1/upload",
        data=body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "User-Agent": "maja-spot-pairs/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, context=ctx(), timeout=120) as r:
        payload = json.loads(r.read().decode())
    url = (payload.get("image") or {}).get("url")
    if not isinstance(url, str) or not url.startswith("https://"):
        raise RuntimeError(f"upload failed for {path.name}: {payload!r}")
    return url.replace("\\/", "/")


def main() -> None:
    TMP.mkdir(parents=True, exist_ok=True)
    cache_map = TMP / "url_cache.json"
    url_cache: dict[str, str] = json.loads(cache_map.read_text()) if cache_map.exists() else {}
    items = []
    titles = {
        "shapes": ["Office desk", "Kitchen counter", "Living room", "Book shelf"],
        "city": ["City skyline", "Busy street", "Night lights", "Urban market"],
        "garden": ["Flower bed", "Park lawn", "Garden path", "Greenhouse"],
        "space": ["Nebula", "Milky Way", "Earth from orbit", "Star field"],
    }

    for cat, sources in SOURCES.items():
        for idx, (slug, src) in enumerate(sources):
            print(f"building {cat}/{slug}…")
            base = load_base(src, TMP / f"{cat}_{slug}_src.jpg")
            left, right, diffs = make_pair(base, seed=hash((cat, slug)) & 0xFFFFFFFF)
            left_path = TMP / f"{cat}_{slug}_left.jpg"
            right_path = TMP / f"{cat}_{slug}_right.jpg"
            left.save(left_path, "JPEG", quality=88)
            right.save(right_path, "JPEG", quality=88)

            left_key = f"{cat}_{slug}_left"
            right_key = f"{cat}_{slug}_right"
            if left_key not in url_cache:
                print(f"  uploading left…")
                url_cache[left_key] = upload_image(left_path)
                cache_map.write_text(json.dumps(url_cache, indent=2))
            if right_key not in url_cache:
                print(f"  uploading right…")
                url_cache[right_key] = upload_image(right_path)
                cache_map.write_text(json.dumps(url_cache, indent=2))

            left_url = url_cache[left_key]
            right_url = url_cache[right_key]
            item_id = f"spot.{cat}.{slug}"
            items.append(
                {
                    "id": item_id,
                    "type": "spot_pair",
                    "categories": [cat],
                    "difficulty": round(0.2 + idx * 0.15, 2),
                    "popularity": round(0.9 - idx * 0.1, 2),
                    "media": [
                        {"kind": "image", "url": left_url, "w": W, "h": H, "alt": "Picture A"},
                        {"kind": "image", "url": right_url, "w": W, "h": H, "alt": "Picture B"},
                    ],
                    "attributes": {
                        "title": titles[cat][idx],
                        "aspect": ASPECT,
                        "diffs": diffs,
                    },
                    "status": "approved",
                }
            )
            print(f"  ok {item_id}")

    pack = {
        "packId": "spot_pair",
        "title": "Spot the Difference scenes",
        "items": items,
    }
    OUT_PACK.write_text(json.dumps(pack, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT_PACK} ({len(items)} items)")


if __name__ == "__main__":
    main()
