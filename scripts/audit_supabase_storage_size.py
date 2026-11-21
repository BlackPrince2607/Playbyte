"""Audit Supabase Storage usage (bucket/file sizes). Does not print secrets."""
from __future__ import annotations

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


def list_all(client: httpx.Client, base: str, headers: dict[str, str], bucket: str, prefix: str = ""):
    items: list[dict] = []
    offset = 0
    while True:
        res = client.post(
            f"{base}/storage/v1/object/list/{bucket}",
            headers={**headers, "Content-Type": "application/json"},
            json={"prefix": prefix, "limit": 1000, "offset": offset},
        )
        if not res.is_success:
            return items, f"err {res.status_code} {res.text[:200]}"
        batch = res.json() or []
        if not batch:
            break
        for it in batch:
            name = it.get("name") or ""
            meta = it.get("metadata") or {}
            size = int(meta.get("size") or 0) if isinstance(meta, dict) else 0
            full = f"{prefix}{name}" if not prefix else f"{prefix.rstrip('/')}/{name}"
            # Folder markers typically have no id and empty/null metadata
            is_folder = it.get("id") is None and size == 0
            if is_folder:
                sub, err = list_all(client, base, headers, bucket, full + "/")
                if err:
                    return items + sub, err
                items.extend(sub)
            else:
                items.append({"path": full, "size": size, "updated": it.get("updated_at")})
        if len(batch) < 1000:
            break
        offset += 1000
    return items, None


def main() -> None:
    env = load_env()
    base = (env.get("SUPABASE_URL") or "").rstrip("/")
    svc = env.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    print(f"SUPABASE_URL={base}")
    print(f"HAS_SERVICE_ROLE={bool(svc)}")
    if not base or not svc:
        raise SystemExit("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")

    headers = {"Authorization": f"Bearer {svc}", "apikey": svc}
    with httpx.Client(timeout=90.0) as client:
        r = client.get(f"{base}/storage/v1/bucket", headers=headers)
        print(f"LIST_BUCKETS status={r.status_code}")
        if not r.is_success:
            print(r.text[:400])
            raise SystemExit(1)
        buckets = r.json()
        names = [b.get("id") or b.get("name") for b in buckets]
        print(f"BUCKETS={names}")

        # Prefer DB aggregate if storage.objects is reachable via PostgREST
        agg = client.get(
            f"{base}/rest/v1/objects?select=bucket_id,metadata",
            headers={**headers, "Accept-Profile": "storage", "Prefer": "count=exact"},
        )
        print(f"REST_OBJECTS status={agg.status_code} range={agg.headers.get('content-range')}")

        totals: dict[str, dict] = {}
        for bid in names:
            items, err = list_all(client, base, headers, bid)
            total = sum(i["size"] for i in items)
            totals[bid] = {"bytes": total, "files": len(items), "err": err}
            top = sorted(items, key=lambda x: x["size"], reverse=True)[:15]
            print()
            print(f"=== {bid} === files={len(items)} bytes={total} ({total / 1024 / 1024:.2f} MiB) err={err}")
            for t in top:
                print(f"  {t['size'] / 1024 / 1024:8.2f} MiB  {t['path']}")

        print()
        print("=== TOTAL ===")
        grand = sum(v["bytes"] for v in totals.values())
        print(f"{grand} bytes = {grand / 1024 / 1024:.2f} MiB = {grand / 1024 / 1024 / 1024:.3f} GiB")
        for k, v in sorted(totals.items(), key=lambda kv: -kv[1]["bytes"]):
            print(f"  {k}: {v['bytes'] / 1024 / 1024:.2f} MiB ({v['files']} files)")


if __name__ == "__main__":
    main()
