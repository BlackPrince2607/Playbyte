"""Break down moment-media usage by moment status (referenced keys only)."""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path

import httpx
import psycopg

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


def list_sizes(client: httpx.Client, base: str, headers: dict[str, str], bucket: str) -> dict[str, int]:
    sizes: dict[str, int] = {}

    def walk(prefix: str = "") -> None:
        offset = 0
        while True:
            res = client.post(
                f"{base}/storage/v1/object/list/{bucket}",
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


def main() -> None:
    env = load_env()
    base = env["SUPABASE_URL"].rstrip("/")
    svc = env["SUPABASE_SERVICE_ROLE_KEY"]
    dsn = (env.get("DATABASE_URL_SYNC") or env["DATABASE_URL"]).replace(
        "postgresql+asyncpg://", "postgresql://"
    )
    headers = {"Authorization": f"Bearer {svc}", "apikey": svc}

    print("Listing storage sizes…")
    with httpx.Client(timeout=120.0) as client:
        sizes = list_sizes(client, base, headers, "moment-media")
    print(f"stored_files={len(sizes)}")

    # key -> best (most "active") status among moments that reference it
    priority = {
        "live": 0,
        "ready": 1,
        "scheduled": 2,
        "closed": 3,
        "retired": 4,
        "draft": 5,
    }
    key_status: dict[str, str] = {}
    status_counts = defaultdict(lambda: {"keys": set(), "moments": 0})

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
                status_counts[status]["keys"].add(key)
                status_counts[status]["moments"]  # noqa: touch
                prev = key_status.get(key)
                if prev is None or priority.get(status, 99) < priority.get(prev, 99):
                    key_status[key] = status

            cur.execute(
                """
                SELECT status::text, count(*)
                FROM moments
                GROUP BY status
                ORDER BY count(*) DESC
                """
            )
            print("\nMoment counts by status:")
            for status, n in cur.fetchall():
                print(f"  {status}: {n}")

    # Bytes by exclusive status bucket (each key counted once, best status)
    by_best: dict[str, list[int]] = defaultdict(list)
    missing = 0
    for key, status in key_status.items():
        if key in sizes:
            by_best[status].append(sizes[key])
        else:
            missing += 1

    unreferenced = [p for p in sizes if p not in key_status]
    unreferenced_bytes = sum(sizes[p] for p in unreferenced)

    print(f"\nUnique media keys referenced: {len(key_status)} (missing from storage: {missing})")
    print("Storage by best referencing moment status (each file counted once):")
    total = 0
    for status in ("live", "ready", "scheduled", "closed", "retired", "draft"):
        sz = by_best.get(status, [])
        nbytes = sum(sz)
        total += nbytes
        print(f"  {status:10s}  {len(sz):5d} files  {nbytes / 1024 / 1024:8.2f} MiB")
    print(f"  {'unreferenced':10s}  {len(unreferenced):5d} files  {unreferenced_bytes / 1024 / 1024:8.2f} MiB")
    print(f"  TOTAL referenced+orphan ≈ {(total + unreferenced_bytes) / 1024 / 1024:.2f} MiB")

    inactive = sum(sum(by_best[s]) for s in ("closed", "retired", "draft"))
    active = sum(sum(by_best[s]) for s in ("live", "ready", "scheduled"))
    print()
    print(f"ACTIVE (live/ready/scheduled): {active / 1024 / 1024:.2f} MiB")
    print(f"INACTIVE (closed/retired/draft): {inactive / 1024 / 1024:.2f} MiB")
    print(f"ORPHAN (not in DB): {unreferenced_bytes / 1024 / 1024:.2f} MiB")
    reclaimable = inactive + unreferenced_bytes
    print(f"RECLAIMABLE if inactive+orphan deleted: {reclaimable / 1024 / 1024:.2f} MiB")


if __name__ == "__main__":
    main()
