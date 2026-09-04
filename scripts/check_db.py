import asyncio

from sqlalchemy import text

from app.infrastructure.postgres.db import engine


async def main() -> None:
    try:
        async with engine.connect() as conn:
            v = await conn.scalar(text("select 1"))
            print("DB connection: OK", v)
            tables = await conn.scalar(
                text(
                    "select count(*) from information_schema.tables where table_schema = 'public'"
                )
            )
            print("Public tables:", tables)
    except Exception as e:
        print("DB connection: FAILED")
        print(type(e).__name__ + ":", str(e)[:300])


if __name__ == "__main__":
    asyncio.run(main())
