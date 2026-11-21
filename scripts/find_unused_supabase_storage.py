"""Find Supabase Storage objects not referenced by the app DB. Does not delete."""
from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path
from urllib.parse import unquote, urlparse

import httpx
import psycopg

ROOT = Path(__file__).resolve().parents[1]

BUCKETS = ("moment-media", "share-cards", "avatars", "exports")


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
            is_folder = it.get("id") is None and size == 0
            if is_folder:
                sub, err = list_all(client, base, headers, bucket, full + "/")
                if err:
                    return items + sub, err
                items.extend(sub)
            else:
                items.append({"path": full, "size": size})
        if len(batch) < 1000:
            break
        offset += 1000
    return items, None


def normalize_key(raw: str | None, *, bucket: str, supabase_url: str) -> str | None:
    if not raw:
        return None
    key = raw.strip()
    if not key:
        return None
    # Full public URL → object key
    prefix = f"{supabase_url.rstrip('/')}/storage/v1/object/public/{bucket}/"
    if key.startswith(prefix):
        key = unquote(key[len(prefix) :])
    elif "/storage/v1/object/public/" in key:
        # other host / signed-style public path
        m = re.search(rf"/storage/v1/object/public/{re.escape(bucket)}/(.+?)(?:\?|$)", key)
        if m:
            key = unquote(m.group(1))
    elif key.startswith("http://") or key.startswith("https://"):
        path = urlparse(key).path
        m = re.search(rf"/storage/v1/object/(?:public|sign)/{re.escape(bucket)}/(.+)$", path)
        if m:
            key = unquote(m.group(1))
        else:
            return None
    return key.lstrip("/")


def fetch_referenced_keys(dsn: str, supabase_url: str) -> dict[str, set[str]]:
    """bucket -> set of object keys referenced by DB."""
    refs: dict[str, set[str]] = {b: set() for b in BUCKETS}
    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT prompt_image_key FROM moments WHERE prompt_image_key IS NOT NULL
                UNION
                SELECT image_key FROM moment_options WHERE image_key IS NOT NULL
                """
            )
            for (raw,) in cur.fetchall():
                key = normalize_key(raw, bucket="moment-media", supabase_url=supabase_url)
                if key:
                    refs["moment-media"].add(key)

            # profiles / users avatar column — tolerate schema drift
            for table, col in (("profiles", "avatar_key"), ("users", "avatar_key")):
                try:
                    cur.execute(f"SELECT {col} FROM {table} WHERE {col} IS NOT NULL")
                    for (raw,) in cur.fetchall():
                        key = normalize_key(raw, bucket="avatars", supabase_url=supabase_url)
                        if key:
                            refs["avatars"].add(key)
                    break
                except psycopg.errors.UndefinedTable:
                    conn.rollback()
                except psycopg.errors.UndefinedColumn:
                    conn.rollback()

            try:
                cur.execute("SELECT asset_key FROM share_cards WHERE asset_key IS NOT NULL")
                for (raw,) in cur.fetchall():
                    key = normalize_key(raw, bucket="share-cards", supabase_url=supabase_url)
                    if key:
                        refs["share-cards"].add(key)
            except psycopg.errors.UndefinedTable:
                conn.rollback()

            # Counts for context
            cur.execute(
                """
                SELECT
                  (SELECT count(*) FROM moments WHERE prompt_image_key IS NOT NULL) AS moments_with_img,
                  (SELECT count(*) FROM moment_options WHERE image_key IS NOT NULL) AS options_with_img,
                  (SELECT count(*) FROM moments) AS moments_total,
                  (SELECT count(*) FROM moments WHERE status IN ('live', 'ready', 'scheduled')) AS moments_active
                """
            )
            row = cur.fetchone()
            print(
                "DB_CONTEXT "
                f"moments_total={row[2]} live_ready_scheduled={row[3]} "
                f"with_prompt_image={row[0]} options_with_image={row[1]}"
            )
    return refs


def main() -> None:
    env = load_env()
    base = (env.get("SUPABASE_URL") or "").rstrip("/")
    svc = env.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    dsn = env.get("DATABASE_URL_SYNC") or env.get("DATABASE_URL") or ""
    # asyncpg DSN sometimes uses postgresql+asyncpg — normalize for psycopg
    dsn = dsn.replace("postgresql+asyncpg://", "postgresql://")
    if not base or not svc or not dsn:
        raise SystemExit("Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL(_SYNC)")

    print(f"SUPABASE_URL={base}")
    refs = fetch_referenced_keys(dsn, base)
    for b, keys in refs.items():
        print(f"REFERENCED {b}: {len(keys)}")

    headers = {"Authorization": f"Bearer {svc}", "apikey": svc}
    unused_report: list[tuple[str, int, int]] = []

    with httpx.Client(timeout=120.0) as client:
        for bucket in BUCKETS:
            items, err = list_all(client, base, headers, bucket)
            if err:
                print(f"{bucket}: LIST_ERROR {err}")
                continue
            stored = {i["path"]: i["size"] for i in items}
            used = refs.get(bucket, set())
            # Also treat basename-only refs / prefix mismatches gently:
            # if DB stores key with or without leading folder, match exact path only.
            orphan_paths = [p for p in stored if p not in used]
            used_bytes = sum(stored[p] for p in stored if p in used)
            orphan_bytes = sum(stored[p] for p in orphan_paths)
            missing_refs = sorted(used - set(stored.keys()))

            print()
            print(f"=== {bucket} ===")
            print(f"stored_files={len(stored)} referenced={len(used)} in_use={len(stored) - len(orphan_paths)}")
            print(
                f"in_use_bytes={used_bytes / 1024 / 1024:.2f} MiB  "
                f"unused_bytes={orphan_bytes / 1024 / 1024:.2f} MiB  "
                f"unused_files={len(orphan_paths)}"
            )
            if missing_refs:
                print(f"DB_KEYS_MISSING_FROM_STORAGE={len(missing_refs)} (sample: {missing_refs[:5]})")

            # Prefix breakdown for unused
            by_prefix: dict[str, list[int]] = defaultdict(list)
            for p in orphan_paths:
                top = p.split("/", 1)[0] if "/" in p else "(root)"
                by_prefix[top].append(stored[p])
            for top, sizes in sorted(by_prefix.items(), key=lambda kv: -sum(kv[1])):
                print(
                    f"  unused/{top}: {len(sizes)} files, {sum(sizes) / 1024 / 1024:.2f} MiB"
                )

            top_orphans = sorted(orphan_paths, key=lambda p: stored[p], reverse=True)[:12]
            for p in top_orphans:
                print(f"  {stored[p] / 1024 / 1024:8.2f} MiB  {p}")

            unused_report.append((bucket, len(orphan_paths), orphan_bytes))

    print()
    print("=== UNUSED TOTAL ===")
    grand_files = sum(f for _, f, _ in unused_report)
    grand_bytes = sum(b for _, _, b in unused_report)
    print(f"{grand_files} files, {grand_bytes / 1024 / 1024:.2f} MiB ({grand_bytes / 1024 / 1024 / 1024:.3f} GiB)")
    for bucket, files, nbytes in unused_report:
        if files:
            print(f"  {bucket}: {files} files, {nbytes / 1024 / 1024:.2f} MiB")


if __name__ == "__main__":
    main()
