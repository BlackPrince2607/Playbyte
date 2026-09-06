# Playbyte

Playbyte is a participation-first swipeable play feed. Every card is a short live **moment** (Predict, Pulse, Reaction) or a built-in **mini-game**. Users weigh in in seconds and see how they fit into a live crowd.

The consumer UI brand in Stitch is **PLAY**. The product and repository name is **Playbyte**. Public leaderboards are deferred past MVP.

## Architecture

- **Mobile:** Expo (React Native) + TypeScript — Stitch design tokens
- **Admin CMS:** Next.js + TypeScript
- **API:** Python FastAPI modular monolith
- **Data:** PostgreSQL (Supabase in hosted environments)
- **Realtime:** `RealtimePublisher` interface → Supabase Broadcast (poll fallback)
- **Worker:** Postgres outbox consumer

See [docs/architecture.md](docs/architecture.md) and [docs/implementation-plan.md](docs/implementation-plan.md).

## Project structure

```text
apps/mobile          Expo client
apps/admin           Editorial CMS
backend              FastAPI + worker
supabase             SQL migrations and seed
packages/api-client  Shared TypeScript API types
docs                 PRD extracts, ADRs, design, runbooks
```

## Prerequisites

- Python 3.12+
- Node.js 20+
- pnpm 10+
- Docker (local Postgres) or a Supabase project
- `uv` (`python -m uv`)

## Local setup

```bash
cp .env.example .env
docker compose up -d postgres
# apply schema
psql postgresql://playbyte:playbyte@localhost:5432/playbyte -f supabase/migrations/0001_init.sql
psql postgresql://playbyte:playbyte@localhost:5432/playbyte -f supabase/seed/001_categories_and_games.sql
psql postgresql://playbyte:playbyte@localhost:5432/playbyte -f supabase/seed/002_sample_moments.sql

cd backend
python -m uv sync
python -m uv run uvicorn app.main:app --reload --port 8000

# in another terminal
python -m uv run python -m worker.main

# JS apps
pnpm install
pnpm admin:dev
pnpm mobile:start
```

API docs: http://localhost:8000/docs

## Environment variables

See [.env.example](.env.example). Never commit secrets.

## Testing

```bash
cd backend && python -m uv run pytest
pnpm lint && pnpm typecheck && pnpm test
```

## Deployment

See [docs/production-deployment.md](docs/production-deployment.md) and [docs/deployment-runbook.md](docs/deployment-runbook.md). For Railway API + worker setup see [docs/railway.md](docs/railway.md). Production promotion is explicit (staging first). Current gate: **NOT READY FOR STAGING** — see [docs/production-readiness-audit.md](docs/production-readiness-audit.md).
