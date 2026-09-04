import uuidfrom contextlib import asynccontextmanagerfrom pathlib import Pathfrom fastapi import FastAPI, Requestfrom fastapi.middleware.cors import CORSMiddlewarefrom sqlalchemy import textfrom app.api.v1 import api_routerfrom app.common.errors import AppError, app_error_handler, unhandled_error_handlerfrom app.common.security import validate_production_settingsfrom app.config import get_settingsfrom app.infrastructure.postgres.db import SessionLocal@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    errors = validate_production_settings(settings)
    if errors:
        raise RuntimeError("Production configuration invalid:\n- " + "\n- ".join(errors))
    if settings.app_env != "production":
        Path("storage/share-cards").mkdir(parents=True, exist_ok=True)
        Path("storage/exports").mkdir(parents=True, exist_ok=True)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Playbyte API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Admin-Key", "Idempotency-Key", "X-Request-Id"],
    )
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)

    @app.middleware("http")
    async def request_id_mw(request: Request, call_next):
        request.state.request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
        response = await call_next(request)
        response.headers["X-Request-Id"] = request.state.request_id
        return response

    @app.get("/health")
    async def health() -> dict:
        return {"ok": True}

    @app.get("/ready")
    async def ready() -> dict:
        try:
            async with SessionLocal() as session:
                await session.execute(text("SELECT 1"))
            return {"ok": True, "database": "up"}
        except Exception as exc:
            raise AppError("unavailable", "Database not ready.", 503) from exc

    app.include_router(api_router)

    if settings.app_env != "production":
        from fastapi.staticfiles import StaticFiles

        static = Path("storage")
        static.mkdir(exist_ok=True)
        app.mount("/static", StaticFiles(directory=str(static)), name="static")

    return app


app = create_app()
