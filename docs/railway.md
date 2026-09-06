# Railway deployment (Playbyte API)

Use **one public API service** from `backend/`. Mobile and admin both call that API.
Do **not** deploy `@playbyte/mobile` or `@playbyte/admin` as the API.

## Fix: “Detected Node / No start command” (Railpack)

That error means Railway is building the **monorepo root** (pnpm workspace), not the Python API.

### Do this in Railway (required)

1. Open the service that should be the API (or create a new one from the GitHub repo).
2. **Settings → Source → Root Directory** → set to:

   ```text
   backend
   ```

3. **Settings → Build** → use **Dockerfile** (Railway will find `backend/Dockerfile` once root is `backend`).
4. Redeploy.

Optional: delete the broken `@playbyte/mobile` / `@playbyte/admin` services if they were auto-created from the monorepo.

## Recommended services

| Service | Root directory | Start command | Public domain |
|---------|----------------|---------------|---------------|
| **API** | `backend` | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` | **Yes — public HTTPS** |
| **Worker** (optional) | `backend` | `python -m worker.main` | No |

Config files: `backend/railway.toml` (API), `backend/railway.worker.toml` (worker reference).

## Public URL vs `.railway.internal`

| URL | Use for |
|-----|---------|
| `https://….up.railway.app` (or custom domain) | Mobile / Expo / EAS / browsers / `EXPO_PUBLIC_API_URL` |
| `*.railway.internal` | **Only** Railway service-to-service (private). Phones and Expo **cannot** reach this. |

In Railway: service → **Settings → Networking → Generate domain** → copy the **public** HTTPS URL.

## Create the API service

1. Railway project → **New** → **GitHub Repo** → `BlackPrince2607/Playbyte`
2. Set **Root Directory** to `backend`
3. Builder: Dockerfile (`backend/Dockerfile`)
4. Generate a **public domain**
5. Set variables (Variables tab):

```text
APP_ENV=staging
API_PUBLIC_URL=https://YOUR-SERVICE.up.railway.app
CORS_ORIGINS=http://localhost:8081,https://YOUR-ADMIN-URL
DATABASE_URL=postgresql+asyncpg://...   # Supabase pooler / Postgres
GUEST_TOKEN_SECRET=<long-random>
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=...
SUPABASE_JWT_AUDIENCE=authenticated
ADMIN_API_KEY=<long-random>
```

6. Verify:

```bash
curl https://YOUR-SERVICE.up.railway.app/health
curl https://YOUR-SERVICE.up.railway.app/ready
```

## Point mobile at Railway

Local Expo (`apps/mobile/.env`):

```text
EXPO_PUBLIC_API_URL=https://YOUR-SERVICE.up.railway.app
```

EAS preview:

```bash
cd apps/mobile
eas env:create --environment preview --name EXPO_PUBLIC_API_URL --value "https://YOUR-SERVICE.up.railway.app" --visibility plaintext
```
