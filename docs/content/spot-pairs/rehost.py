"""Re-upload spot pair JPEGs to ImgBB (hotlink-friendly) and rewrite spot_pair.json."""
from __future__ import annotations

import json
import ssl
import urllib.parse
import urllib.request
from pathlib import Path

# Public demo key from ImgBB docs
IMGBB_KEY = "b5d0b0c0f0e0d0c0b0a090807060504"  # placeholder — will try env / freeimage alternative

TMP = Path(__file__).parent / "tmp"
PACK = Path(__file__).resolve().parents[3] / "apps" / "mobile" / "src" / "game" / "content" / "packs" / "spot_pair.json"
CACHE = Path(__file__).parent / "imgbb_cache.json"


def ctx():
    return ssl.create_default_context()


def upload_imgbb(path: Path, key: str) -> str:
    import base64

    b64 = base64.b64encode(path.read_bytes()).decode()
    body = urllib.parse.urlencode({"key": key, "image": b64}).encode()
    req = urllib.request.Request(
        "https://api.imgbb.com/1/upload",
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "maja-spot/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(req, context=ctx(), timeout=120) as r:
        payload = json.loads(r.read().decode())
    url = (((payload.get("data") or {}).get("image") or {}).get("url")) or (payload.get("data") or {}).get("url")
    if not isinstance(url, str) or not url.startswith("https://"):
        raise RuntimeError(payload)
    return url


def upload_via_github_style() -> None:
    """Fallback: point pack at raw.githubusercontent once images are committed under images/."""
    images = Path(__file__).parent / "images"
    images.mkdir(exist_ok=True)
    for p in sorted(TMP.glob("*_left.jpg")) + sorted(TMP.glob("*_right.jpg")):
        dest = images / p.name
        if not dest.exists():
            dest.write_bytes(p.read_bytes())
    pack = json.loads(PACK.read_text(encoding="utf-8"))
    base = "https://cdn.jsdelivr.net/gh/BlackPrince2607/Playbyte@main/docs/content/spot-pairs/images"
    for item in pack["items"]:
        # id spot.shapes.desk_1 → shapes_desk_1
        slug = item["id"].replace("spot.", "").replace(".", "_")
        left = f"{base}/{slug}_left.jpg"
        right = f"{base}/{slug}_right.jpg"
        item["media"] = [
            {"kind": "image", "url": left, "w": 800, "h": 500, "alt": "Picture A"},
            {"kind": "image", "url": right, "w": 800, "h": 500, "alt": "Picture B"},
        ]
    PACK.write_text(json.dumps(pack, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {PACK} with jsDelivr URLs; images in {images}")


if __name__ == "__main__":
    upload_via_github_style()
