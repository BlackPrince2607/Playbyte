import os

import pytest

# Tests must not depend on a developer's local `.env`.
os.environ["DATABASE_URL"] = "postgresql+asyncpg://playbyte:playbyte@localhost:5432/playbyte"
os.environ.setdefault("APP_ENV", "development")
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""


def pytest_configure(config: pytest.Config) -> None:
    from app.config import get_settings

    get_settings.cache_clear()
