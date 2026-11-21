#!/usr/bin/env python3
"""Re-measure D1/D7 game retention + streak health from Postgres.

Usage (repo root, DATABASE_URL in env or .env):

  python scripts/remeasure_retention.py

Compare against the baseline in docs/runbooks/retention-metrics.md.
Decide on full remote push only after activated D1 is near the ≥20% target.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from urllib.parse import urlparse


def load_dotenv() -> None:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def main() -> int:
    load_dotenv()
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 1

    try:
        import psycopg
    except ImportError:
        print("Install psycopg: python -m pip install 'psycopg[binary]'", file=sys.stderr)
        return 1

    parsed = urlparse(url)
    print(f"host={parsed.hostname} db={parsed.path.lstrip('/')}")

    queries = {
        "d1_d7_plays": """
WITH first_day AS (
  SELECT user_id, (min(created_at) AT TIME ZONE 'Asia/Kolkata')::date AS d0
  FROM game_plays WHERE user_id IS NOT NULL
  GROUP BY user_id
),
active AS (
  SELECT DISTINCT user_id, (created_at AT TIME ZONE 'Asia/Kolkata')::date AS d
  FROM game_plays WHERE user_id IS NOT NULL
)
SELECT
  count(*) AS activated_players,
  count(*) FILTER (WHERE d0 <= (now() AT TIME ZONE 'Asia/Kolkata')::date - 1) AS eligible_d1,
  count(*) FILTER (WHERE d0 <= (now() AT TIME ZONE 'Asia/Kolkata')::date - 1
    AND EXISTS (SELECT 1 FROM active a WHERE a.user_id = f.user_id AND a.d = f.d0 + 1)) AS returned_d1,
  count(*) FILTER (WHERE d0 <= (now() AT TIME ZONE 'Asia/Kolkata')::date - 7) AS eligible_d7,
  count(*) FILTER (WHERE d0 <= (now() AT TIME ZONE 'Asia/Kolkata')::date - 7
    AND EXISTS (SELECT 1 FROM active a WHERE a.user_id = f.user_id AND a.d = f.d0 + 7)) AS returned_d7,
  count(*) FILTER (WHERE d0 <= (now() AT TIME ZONE 'Asia/Kolkata')::date - 7
    AND EXISTS (SELECT 1 FROM active a WHERE a.user_id = f.user_id AND a.d > f.d0 AND a.d <= f.d0 + 7)) AS returned_within_d7
FROM first_day f;
""",
        "streaks": """
SELECT
  count(*) AS streak_rows,
  count(*) FILTER (WHERE current_count >= 2) AS streak_ge2,
  count(*) FILTER (WHERE current_count >= 3) AS streak_ge3,
  round(avg(current_count)::numeric, 2) AS avg_current,
  round(avg(best_count)::numeric, 2) AS avg_best
FROM user_streaks;
""",
        "push_tokens": """
SELECT count(*) AS tokens, count(DISTINCT user_id) AS users_with_token FROM push_tokens;
""",
        "active_days": """
WITH days AS (
  SELECT user_id, count(DISTINCT (created_at AT TIME ZONE 'Asia/Kolkata')::date) AS active_days
  FROM game_plays WHERE user_id IS NOT NULL
  GROUP BY user_id
)
SELECT active_days, count(*) AS users FROM days GROUP BY 1 ORDER BY 1;
""",
    }

    with psycopg.connect(url) as conn:
        for name, sql in queries.items():
            print(f"\n=== {name} ===")
            with conn.cursor() as cur:
                cur.execute(sql)
                cols = [d.name for d in cur.description]
                rows = cur.fetchall()
                for row in rows:
                    data = dict(zip(cols, row))
                    print(data)
                    if name == "d1_d7_plays":
                        e1 = int(data.get("eligible_d1") or 0)
                        r1 = int(data.get("returned_d1") or 0)
                        e7 = int(data.get("eligible_d7") or 0)
                        within = int(data.get("returned_within_d7") or 0)
                        if e1:
                            print(f"D1 rate: {100.0 * r1 / e1:.1f}% (target ≥20%)")
                        if e7:
                            print(f"Within-7d rate: {100.0 * within / e7:.1f}% (target ≥35%)")

    print(
        "\nDecision: if D1 ≥20% and streak_ge2 is rising, schedule remote push (FCM/APNs)."
        " Otherwise iterate local reminder + day-0 ritual first."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
