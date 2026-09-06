FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml ./
RUN uv pip install --system --no-cache \
    "fastapi>=0.115" "uvicorn[standard]>=0.32" "sqlalchemy[asyncio]>=2.0.36" \
    "asyncpg>=0.30" "psycopg2-binary>=2.9" "pydantic-settings>=2.6" \
    "pyjwt[crypto]>=2.10" "httpx>=0.27" "python-multipart>=0.0.17" \
    "orjson>=3.10" "pillow>=11.0" "structlog>=24.4"
COPY . .
ENV PYTHONPATH=/app
EXPOSE 8000
# Railway injects $PORT; default 8000 for local Docker.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
