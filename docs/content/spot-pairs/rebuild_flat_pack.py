"""
DEPRECATED entrypoint — use bake_bundled_pairs.py.

1) Place base flat 2D scenes in apps/mobile/assets/spot-pairs/<key>.jpg
   (or regenerate from Cursor assets via prepare step below).
2) Run: python docs/content/spot-pairs/bake_bundled_pairs.py
   which writes *_left.jpg / *_right.jpg and spot_pair.json with asset:spot/ URLs.
"""
from __future__ import annotations

import runpy
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
ASSETS_SRC = Path(r"C:\Users\user\.cursor\projects\d-Play\assets")
MOBILE_ASSETS = ROOT / "apps" / "mobile" / "assets" / "spot-pairs"
W, H = 800, 500

BASES = [
    "shapes_desk_1",
    "shapes_kitchen_1",
    "shapes_living_1",
    "shapes_shelf_1",
    "city_skyline_1",
    "city_street_1",
    "city_night_1",
    "city_market_1",
    "garden_flowers_1",
    "garden_park_1",
    "garden_path_1",
    "garden_greenhouse_1",
    "space_nebula_1",
    "space_milky_1",
    "space_earth_1",
    "space_stars_1",
]


def prepare_bases() -> None:
    MOBILE_ASSETS.mkdir(parents=True, exist_ok=True)
    for stem in BASES:
        src = ASSETS_SRC / f"{stem}.jpg"
        if not src.exists():
            src = ASSETS_SRC / f"{stem}.png"
        if not src.exists():
            existing = MOBILE_ASSETS / f"{stem}.jpg"
            if existing.exists():
                print("keep", existing.name)
                continue
            raise FileNotFoundError(stem)
        im = Image.open(src).convert("RGB").resize((W, H), Image.Resampling.LANCZOS)
        dest = MOBILE_ASSETS / f"{stem}.jpg"
        im.save(dest, "JPEG", quality=88, optimize=True)
        print("base", dest.name)


if __name__ == "__main__":
    prepare_bases()
    runpy.run_path(str(Path(__file__).with_name("bake_bundled_pairs.py")), run_name="__main__")
