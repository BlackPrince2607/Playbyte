"""Upload pair JPEGs to Supabase Storage public bucket `spot-pairs` and rewrite pack URLs."""
from __future__ import annotations

import json
import ssl
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ENV = (ROOT / "apps" / "mobile" / ".env").read_text(encoding="utf-8")
TMP = Path(__file__).parent / "tmp"
PACK = ROOT / "apps" / "mobile" / "src" / "game" / "content" / "packs" / "spot_pair.json"
BUCKET = "spot-pairs"


def env(name: str) -> str:
    for line in ENV.splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit(f"missing {name}")


URL = env("EXPO_PUBLIC_SUPABASE_URL").rstrip("/")
KEY = env("EXPO_PUBLIC_SUPABASE_ANON_KEY")


def req(method: str, path: str, data: bytes | None = None, content_type: str | None = None):
    headers = {"Authorization": f"Bearer {KEY}", "apikey": KEY}
    if content_type:
        headers["Content-Type"] = content_type
    if data is not None and method in ("POST", "PUT"):
        headers["x-upsert"] = "true"
    r = urllib.request.Request(f"{URL}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, context=ssl.create_default_context(), timeout=120) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def ensure_bucket() -> None:
    status, body = req(
        "POST",
        "/storage/v1/bucket",
        data=json.dumps({"id": BUCKET, "name": BUCKET, "public": True}).encode(),
        content_type="application/json",
    )
    print("bucket", status, body[:200])


def upload(path: Path) -> str:
    status, body = req(
        "POST",
        f"/storage/v1/object/{BUCKET}/{path.name}",
        data=path.read_bytes(),
        content_type="image/jpeg",
    )
    print("upload", path.name, status, body[:120])
    if status not in (200, 201):
        # try PUT upsert
        status, body = req(
            "PUT",
            f"/storage/v1/object/{BUCKET}/{path.name}",
            data=path.read_bytes(),
            content_type="image/jpeg",
        )
        print("upsert", path.name, status, body[:120])
        if status not in (200, 201):
            raise RuntimeError(f"upload failed {path.name}: {status} {body[:300]}")
    return f"{URL}/storage/v1/object/public/{BUCKET}/{path.name}"


def main() -> None:
    ensure_bucket()
    url_map: dict[str, str] = {}
    for path in sorted(TMP.glob("*_left.jpg")) + sorted(TMP.glob("*_right.jpg")):
        url_map[path.stem] = upload(path)

    pack = json.loads(PACK.read_text(encoding="utf-8"))
    for item in pack["items"]:
        slug = item["id"].replace("spot.", "").replace(".", "_")
        left = url_map[f"{slug}_left"]
        right = url_map[f"{slug}_right"]
        item["media"] = [
            {"kind": "image", "url": left, "w": 800, "h": 500, "alt": "Picture A"},
            {"kind": "image", "url": right, "w": 800, "h": 500, "alt": "Picture B"},
        ]
    PACK.write_text(json.dumps(pack, indent=2) + "\n", encoding="utf-8")
    print("updated", PACK)


if __name__ == "__main__":
    main()
