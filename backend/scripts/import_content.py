"""Import content packs (JSON) into content_items / content_packs through the validation pipeline.

    python -m scripts.import_content                 # all bundled packs from the mobile app
    python -m scripts.import_content path/to/pack.json --dry-run

Pack file shape: {"packId": "flag", "title": "...", "items": [ContentItem, ...]}.
The same files are the app's offline fallback, so editorial content has one source of truth.
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

from app.modules.content.validation import validate_items

DEFAULT_DIR = Path(__file__).resolve().parents[2] / "apps" / "mobile" / "src" / "game" / "content" / "packs"


def load_pack_file(path: Path) -> tuple[dict, list[dict], list[str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("items"), list):
        return {}, [], [f"{path.name}: expected an object with an 'items' array"]
    items, errors = validate_items(data["items"])
    if data.get("packId") != path.stem:
        errors.append(f"{path.name}: packId must equal the file name")
    return data, items, [f"{path.name}: {e}" for e in errors]


async def _write(packs: list[tuple[dict, list[dict]]]) -> None:
    from app.infrastructure.postgres.db import SessionLocal
    from app.modules.content.service import upsert_items, upsert_pack

    async with SessionLocal() as session:
        for meta, items in packs:
            await upsert_items(session, items)
            types = sorted({i["type"] for i in items})
            if types != [meta["packId"]]:
                await upsert_pack(session, meta["packId"], meta.get("title") or meta["packId"], types, [], None, 2000, "enabled")
            print(f"{meta['packId']}: {len(items)} items")
        await session.commit()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*", type=Path)
    parser.add_argument("--dry-run", action="store_true", help="validate only")
    args = parser.parse_args(argv)
    paths = args.paths or sorted(DEFAULT_DIR.glob("*.json"))
    if not paths:
        print("no pack files found", file=sys.stderr)
        return 1
    packs: list[tuple[dict, list[dict]]] = []
    errors: list[str] = []
    for p in paths:
        meta, items, errs = load_pack_file(p)
        errors.extend(errs)
        if meta:
            packs.append((meta, items))
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    if args.dry_run:
        for meta, items in packs:
            print(f"{meta['packId']}: {len(items)} items OK")
        return 0
    asyncio.run(_write(packs))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
