"""Delete moment-media objects that are orphaned or only used by retired moments.

Keeps any object referenced by live / ready / scheduled moments.
Does not modify DB rows (image-only options require image_key by constraint).
"""
from __future__ import annotations

import argparse
import time
from pathlib import Path

import httpx
import psycopg

ROOT = Path(__file__).resolve().parents[1]
BUCKET = "moment-media"
ACTIVE = frozenset({"live", "ready", "scheduled"})
PRIORITY = {"live": 0, "ready": 1, "scheduled": 2, "closed": 3, "retired": 4, "draft": 5}


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


def list_sizes(client: httpx.Client, base: str, headers: dict[str, str]) -> dict[str, int]:
    sizes: dict[str, int] = {}

    def walk(prefix: str = "") -> None:
        offset = 0
        while True:
            res = client.post(
                f"{base}/storage/v1/object/list/{BUCKET}",
                headers={**headers, "Content-Type": "application/json"},
                json={"prefix": prefix, "limit": 1000, "offset": offset},
            )
            res.raise_for_status()
            batch = res.json() or []
            if not batch:
                return
            for it in batch:
                name = it.get("name") or ""
                meta = it.get("metadata") or {}
                size = int(meta.get("size") or 0) if isinstance(meta, dict) else 0
                full = f"{prefix}{name}" if not prefix else f"{prefix.rstrip('/')}/{name}"
                if it.get("id") is None and size == 0:
                    walk(full + "/")
                else:
                    sizes[full] = size
            if len(batch) < 1000:
                return
            offset += 1000

    walk()
    return sizes


def best_status_by_key(dsn: str) -> dict[str, str]:
    key_status: dict[str, str] = {}
    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT m.status::text, m.prompt_image_key AS key
                FROM moments m
                WHERE m.prompt_image_key IS NOT NULL
                UNION ALL
                SELECT m.status::text, o.image_key AS key
                FROM moment_options o
                JOIN moments m ON m.id = o.moment_id
                WHERE o.image_key IS NOT NULL
                """
            )
            for status, key in cur.fetchall():
                if not key:
                    continue
                key = key.lstrip("/")
                prev = key_status.get(key)
                if prev is None or PRIORITY.get(status, 99) < PRIORITY.get(prev, 99):
                    key_status[key] = status
    return key_status


def delete_batch(client: httpx.Client, base: str, headers: dict[str, str], paths: list[str]) -> tuple[int, str]:
    # Supabase Storage: DELETE /object/{bucket} with JSON array of paths
    last_err = ""
    for attempt in range(5):
        try:
            res = client.request(
                "DELETE",
                f"{base}/storage/v1/object/{BUCKET}",
                headers={**headers, "Content-Type": "application/json"},
                json={"prefixes": paths},
            )
            if res.is_success:
                return len(paths), ""
            # Fallback: some deployments expect a raw list body
            res2 = client.request(
                "DELETE",
                f"{base}/storage/v1/object/{BUCKET}",
                headers={**headers, "Content-Type": "application/json"},
                json=paths,
            )
            if res2.is_success:
                return len(paths), ""
            last_err = f"{res.status_code}:{res.text[:200]} | alt {res2.status_code}:{res2.text[:200]}"
            if res.status_code in (429, 500, 502, 503, 504) or res2.status_code in (429, 500, 502, 503, 504):
                time.sleep(1.5 * (attempt + 1))
                continue
            return 0, last_err
        except (httpx.TransportError, httpx.TimeoutException) as exc:
            last_err = f"transport:{exc}"
            time.sleep(1.5 * (attempt + 1))
    return 0, last_err


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--batch-size", type=int, default=100)
    args = parser.parse_args()

    env = load_env()
    base = env["SUPABASE_URL"].rstrip("/")
    svc = env["SUPABASE_SERVICE_ROLE_KEY"]
    dsn = (env.get("DATABASE_URL_SYNC") or env["DATABASE_URL"]).replace(
        "postgresql+asyncpg://", "postgresql://"
    )
    headers = {"Authorization": f"Bearer {svc}", "apikey": svc}

    print("Listing storage…")
    with httpx.Client(timeout=120.0) as client:
        sizes = list_sizes(client, base, headers)
    print(f"stored={len(sizes)}")

    key_status = best_status_by_key(dsn)
    keep = {k for k, st in key_status.items() if st in ACTIVE}
    to_delete = sorted(p for p in sizes if p not in keep)

    keep_bytes = sum(sizes[p] for p in keep if p in sizes)
    del_bytes = sum(sizes[p] for p in to_delete)
    orphan = [p for p in to_delete if p not in key_status]
    retired_only = [p for p in to_delete if key_status.get(p) in {"retired", "closed", "draft"}]

    print(f"KEEP active refs: {len(keep)} files, {keep_bytes / 1024 / 1024:.2f} MiB")
    print(f"DELETE candidates: {len(to_delete)} files, {del_bytes / 1024 / 1024:.2f} MiB")
    print(f"  orphan={len(orphan)} retired/closed/draft-only={len(retired_only)}")

    # Safety: never delete a keep path
    assert keep.isdisjoint(to_delete)

    if args.dry_run:
        print("DRY_RUN — no deletes")
        for p in to_delete[:20]:
            print(f"  would delete {sizes[p] / 1024 / 1024:.2f} MiB  {p}")
        return

    deleted = 0
    failed = 0
    with httpx.Client(timeout=120.0) as client:
        for i in range(0, len(to_delete), args.batch_size):
            batch = to_delete[i : i + args.batch_size]
            n, err = delete_batch(client, base, headers, batch)
            if err:
                print(f"BATCH_FAIL @{i}: {err}")
                # try one-by-one
                for path in batch:
                    n1, err1 = delete_batch(client, base, headers, [path])
                    if err1:
                        failed += 1
                        if failed <= 5:
                            print(f"  FAIL {path}: {err1}")
                    else:
                        deleted += n1
                    time.sleep(0.05)
            else:
                deleted += n
            print(f"progress deleted={deleted}/{len(to_delete)} failed={failed}")
            time.sleep(0.15)

    print(f"DONE deleted={deleted} failed={failed} freed≈{del_bytes / 1024 / 1024:.2f} MiB (if all succeeded)")


if __name__ == "__main__":
    main()
