"""
DEPRECATED — same photo + runtime overlays made differences look like clickable UI marks.

Prefer bake_bundled_pairs.py (distinct left/right flat art under apps/mobile/assets/spot-pairs).
Kept only as historical reference for the overlay-op schema.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

OUT = Path(__file__).resolve().parents[3] / "apps" / "mobile" / "src" / "game" / "content" / "packs" / "spot_pair.json"
ASPECT = 0.625

SOURCES = {
    "shapes": [
        ("desk_1", "Office desk", "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&h=500&q=80"),
        ("kitchen_1", "Kitchen counter", "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=800&h=500&q=80"),
        ("living_1", "Living room", "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=800&h=500&q=80"),
        ("shelf_1", "Book shelf", "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&h=500&q=80"),
    ],
    "city": [
        ("skyline_1", "City skyline", "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?auto=format&fit=crop&w=800&h=500&q=80"),
        ("street_1", "Busy street", "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=800&h=500&q=80"),
        ("night_1", "Night lights", "https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=800&h=500&q=80"),
        ("market_1", "Urban market", "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=800&h=500&q=80"),
    ],
    "garden": [
        ("flowers_1", "Flower bed", "https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=800&h=500&q=80"),
        ("park_1", "Park lawn", "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&w=800&h=500&q=80"),
        ("path_1", "Garden path", "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=800&h=500&q=80"),
        ("greenhouse_1", "Greenhouse", "https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&w=800&h=500&q=80"),
    ],
    "space": [
        ("nebula_1", "Nebula", "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=800&h=500&q=80"),
        ("milky_1", "Milky Way", "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?auto=format&fit=crop&w=800&h=500&q=80"),
        ("earth_1", "Earth from orbit", "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=800&h=500&q=80"),
        ("stars_1", "Star field", "https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?auto=format&fit=crop&w=800&h=500&q=80"),
    ],
}

SLOTS = [
    (0.18, 0.20),
    (0.50, 0.16),
    (0.82, 0.22),
    (0.22, 0.42),
    (0.72, 0.40),
    (0.48, 0.50),
]

OPS = ["blob", "ring", "dim", "bright", "badge", "hide"]
COLORS = ["#FF4D8D", "#FFD84D", "#7FDBFF", "#C6FF3D", "#FF8A3D", "#B28DFF"]


def main() -> None:
    items = []
    for cat, rows in SOURCES.items():
        for idx, (slug, title, url) in enumerate(rows):
            rng = random.Random(hash((cat, slug)) & 0xFFFFFFFF)
            slots = SLOTS[:]
            rng.shuffle(slots)
            ops = OPS[:]
            rng.shuffle(ops)
            diffs = []
            overlays = []
            for i, ((nx, ny), op) in enumerate(zip(slots, ops)):
                hw = round(0.05 + rng.random() * 0.015, 4)
                d_id = f"d{i + 1}"
                side = "right" if i % 2 == 0 else "left"
                diffs.append({"id": d_id, "x": nx, "y": ny, "hw": hw, "hh": hw})
                overlays.append(
                    {
                        "id": d_id,
                        "side": side,
                        "op": op,
                        "color": rng.choice(COLORS),
                    }
                )
            # Same real photo on both sides; overlays are the authored differences.
            items.append(
                {
                    "id": f"spot.{cat}.{slug}",
                    "type": "spot_pair",
                    "categories": [cat],
                    "difficulty": round(0.2 + idx * 0.15, 2),
                    "popularity": round(0.9 - idx * 0.1, 2),
                    "media": [
                        {"kind": "image", "url": url, "w": 800, "h": 500, "alt": "Picture A"},
                        {"kind": "image", "url": url, "w": 800, "h": 500, "alt": "Picture B"},
                    ],
                    "attributes": {
                        "title": title,
                        "aspect": ASPECT,
                        "leftUrl": url,
                        "rightUrl": url,
                        "diffs": diffs,
                        "overlays": overlays,
                    },
                    "status": "approved",
                }
            )
    OUT.write_text(json.dumps({"packId": "spot_pair", "title": "Spot the Difference scenes", "items": items}, indent=2) + "\n", encoding="utf-8")
    print("wrote", OUT, len(items))


if __name__ == "__main__":
    main()
