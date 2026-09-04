"""Apply supabase SQL files. Usage: python scripts/apply_schema.py"""

from pathlib import Path
import os
import sys

import psycopg2


def main() -> None:
    url = os.environ.get("DATABASE_URL_SYNC", "postgresql://playbyte:playbyte@localhost:5432/playbyte")
    root = Path(__file__).resolve().parents[1]
    files = [
        root / "supabase/migrations/0001_init.sql",
        root / "supabase/seed/001_categories_and_games.sql",
        root / "supabase/seed/002_sample_moments.sql",
    ]
    conn = psycopg2.connect(url)
    conn.autocommit = True
    cur = conn.cursor()
    for f in files:
        print("applying", f.name)
        cur.execute(f.read_text(encoding="utf-8"))
    print("done")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("failed:", exc)
        sys.exit(1)
