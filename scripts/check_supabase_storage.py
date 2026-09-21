"""Check Supabase storage buckets using local .env (does not print secrets)."""
from __future__ import annotations

import json
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for p in (ROOT / ".env", ROOT / "backend" / ".env"):
        if not p.exists():
            continue
        for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    return env


def main() -> None:
    env = load_env()
    base = (env.get("SUPABASE_URL") or "https://pzemlrjjqmfosprasivr.supabase.co").rstrip("/")
    anon = env.get("SUPABASE_ANON_KEY") or env.get("EXPO_PUBLIC_SUPABASE_ANON_KEY") or ""
    svc = env.get("SUPABASE_SERVICE_ROLE_KEY") or ""

    print(f"SUPABASE_URL={base}")
    print(f"HAS_ANON={bool(anon)} ANON_LEN={len(anon)}")
    print(f"HAS_SERVICE_ROLE={bool(svc)} SERVICE_LEN={len(svc)}")

    c = httpx.Client(timeout=30.0)
    needed = {"share-cards", "avatars", "exports", "moment-media"}

    if svc:
        r = c.get(
            f"{base}/storage/v1/bucket",
            headers={"Authorization": f"Bearer {svc}", "apikey": svc},
        )
        print(f"LIST_BUCKETS status={r.status_code}")
        if r.is_success:
            buckets = r.json()
            if isinstance(buckets, list):
                names = {(b.get("id") or b.get("name")) for b in buckets}
                print(f"BUCKET_COUNT={len(names)}")
                print(f"NEEDED_PRESENT={sorted(needed & names)}")
                print(f"NEEDED_MISSING={sorted(needed - names)}")
                for b in buckets:
                    bid = b.get("id") or b.get("name")
                    if bid in needed:
                        print(
                            "DETAIL",
                            json.dumps(
                                {
                                    "id": bid,
                                    "public": b.get("public"),
                                    "file_size_limit": b.get("file_size_limit"),
                                    "allowed_mime_types": b.get("allowed_mime_types"),
                                }
                            ),
                        )
            else:
                print("UNEXPECTED", str(buckets)[:300])
        else:
            print(f"LIST_BUCKETS_ERR={r.text[:400]}")

        # Try a tiny PNG upload to share-cards
        png = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
            b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        key = "probe/playbyte-check.png"
        up = c.post(
            f"{base}/storage/v1/object/share-cards/{key}",
            content=png,
            headers={
                "Authorization": f"Bearer {svc}",
                "apikey": svc,
                "Content-Type": "image/png",
                "x-upsert": "true",
            },
        )
        print(f"UPLOAD_PROBE status={up.status_code} body={up.text[:250]}")
        if up.is_success:
            pub = c.get(f"{base}/storage/v1/object/public/share-cards/{key}")
            print(f"PUBLIC_GET status={pub.status_code} bytes={len(pub.content)}")
            # cleanup
            c.delete(
                f"{base}/storage/v1/object/share-cards/{key}",
                headers={"Authorization": f"Bearer {svc}", "apikey": svc},
            )
    else:
        print("NO_SERVICE_ROLE in local .env — cannot list/upload buckets")

    probe = c.get(f"{base}/storage/v1/object/public/share-cards/does-not-exist.png")
    print(f"PUBLIC_MISSING status={probe.status_code}")

    if anon:
        r2 = c.get(
            f"{base}/storage/v1/bucket",
            headers={"Authorization": f"Bearer {anon}", "apikey": anon},
        )
        print(f"ANON_LIST_BUCKETS status={r2.status_code}")


if __name__ == "__main__":
    main()
