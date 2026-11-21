"""Upload pair JPEGs via Cloudinary unsigned docs preset and rewrite spot_pair.json."""
from __future__ import annotations

import json
import ssl
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
TMP = Path(__file__).parent / "tmp"
PACK = ROOT / "apps" / "mobile" / "src" / "game" / "content" / "packs" / "spot_pair.json"
CACHE = Path(__file__).parent / "cloudinary_cache.json"

# From Cloudinary docs sample (unsigned client upload).
CLOUD = "hzxyensd5"
PRESET = "docs_upload_example_us_preset"
ENDPOINT = f"https://api.cloudinary.com/v1_1/{CLOUD}/image/upload"


def upload(path: Path) -> str:
    boundary = "----majaCld"
    data = path.read_bytes()
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="upload_preset"\r\n\r\n'
        f"{PRESET}\r\n"
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="folder"\r\n\r\n'
        f"maja-spot\r\n"
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="public_id"\r\n\r\n'
        f"{path.stem}\r\n"
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{path.name}"\r\n'
        f"Content-Type: image/jpeg\r\n\r\n"
    ).encode() + data + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        ENDPOINT,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "User-Agent": "maja-spot/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=120) as r:
        payload = json.loads(r.read().decode())
    url = payload.get("secure_url")
    if not isinstance(url, str) or not url.startswith("https://"):
        raise RuntimeError(payload)
    return url


def main() -> None:
    cache: dict[str, str] = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    for path in sorted(TMP.glob("*_left.jpg")) + sorted(TMP.glob("*_right.jpg")):
        if path.stem in cache:
            continue
        print("upload", path.name)
        cache[path.stem] = upload(path)
        CACHE.write_text(json.dumps(cache, indent=2))

    pack = json.loads(PACK.read_text(encoding="utf-8"))
    for item in pack["items"]:
        slug = item["id"].replace("spot.", "").replace(".", "_")
        left = cache[f"{slug}_left"]
        right = cache[f"{slug}_right"]
        item["media"] = [
            {"kind": "image", "url": left, "w": 800, "h": 500, "alt": "Picture A"},
            {"kind": "image", "url": right, "w": 800, "h": 500, "alt": "Picture B"},
        ]
    PACK.write_text(json.dumps(pack, indent=2) + "\n", encoding="utf-8")
    print("updated", PACK, "items", len(pack["items"]))
    # smoke-check first url
    first = pack["items"][0]["media"][0]["url"]
    req = urllib.request.Request(first, headers={"User-Agent": "maja-spot/1.0"}, method="HEAD")
    with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=30) as r:
        print("head", first, r.status, r.headers.get("Content-Type"))


if __name__ == "__main__":
    main()
