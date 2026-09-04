import asyncio

from sqlalchemy import text

from app.infrastructure.postgres.db import engine


async def main() -> None:
    async with engine.connect() as conn:
        tables = await conn.scalar(
            text(
                "select count(*) from information_schema.tables "
                "where table_schema = 'public' and table_type = 'BASE TABLE'"
            )
        )
        print("public_tables", tables)
        for name in ("users", "moments", "mini_games", "guest_sessions", "categories"):
            try:
                count = await conn.scalar(text(f"select count(*) from {name}"))
                print(f"{name}", count)
            except Exception as exc:
                print(f"{name} ERROR", type(exc).__name__)


if __name__ == "__main__":
    asyncio.run(main())
