# Game platform — production deployment

Scope: what the Game Engine SDK (11 engines, 42 game rows) needs from the backend, database and
mobile build. General infrastructure lives in `docs/railway.md` and `docs/production-deployment.md`
(`docs/deployment-runbook.md` still describes Fly.io; Railway is what is live).

Live API: `https://playbyte-production.up.railway.app` (Railway service, root directory `backend`,
`backend/railway.toml`). Railway auto-deploys `main`. Both the `preview` and `production` EAS
profiles point at this API — there is no separate staging backend.

## 1. Backend environment variables (Railway, API service + worker)

`validate_production_settings` (`app/common/security.py`) refuses to boot when `APP_ENV=production`
and any of the starred values are missing or weak.

| Variable | Required | Notes |
|---|---|---|
| `APP_ENV` | ★ | `production` enables the boot-time checks and disables `/static`. |
| `DATABASE_URL` | ★ | Supabase pooler URL; `postgresql://` is rewritten to `+asyncpg`. Not localhost. |
| `API_PUBLIC_URL` | ★ | Public `https://` URL of the API. |
| `CORS_ORIGINS` | ★ | Comma list, HTTPS only, no `*` (admin origin). Mobile is not subject to CORS. |
| `GUEST_TOKEN_SECRET` | ★ | 32+ random chars. Rotating it invalidates every guest session. |
| `ADMIN_API_KEY` | ★ | 32+ random chars. Accepted as `X-Admin-Key` for automation; the feed-refresh workflow's `PLAYBYTE_ADMIN_KEY` secret must match. The default or a shorter key never grants access. |
| `SUPABASE_URL` | ★ | JWKS verification of user JWTs. |
| `SUPABASE_SERVICE_ROLE_KEY` | ★ | Server-side storage (share cards, avatars, exports). |
| `SUPABASE_JWT_SECRET` | optional | Only if the project still signs HS256 tokens. |
| `SUPABASE_JWT_AUDIENCE` / `SUPABASE_JWT_ISSUER` | optional | Defaults `authenticated` / derived. |
| `RATE_LIMIT_EVENT_BATCHES_PER_MINUTE` | optional | Default 30 analytics batches / actor / minute. |
| `RATE_LIMIT_RESPONSE_PER_MINUTE`, `RATE_LIMIT_GUEST_CREATE_PER_HOUR` | optional | Defaults 60 / 30. |
| `SENTRY_DSN`, `LOG_LEVEL` | optional | |

Rate limits are in-memory per process: they hold per replica, not globally. Keep the API at one
replica until a shared limiter exists, or accept N× the configured limits.

## 2. Database migrations (Supabase, in order)

1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_storage.sql`
3. `supabase/migrations/0003_content_tags_media.sql`
4. `supabase/migrations/0004_game_plays_duration.sql`
5. `supabase/migrations/0005_game_engine_sdk.sql` — `mini_games.engine/variation/config_version/score_direction`,
   `game_plays` SDK metadata columns, `content_items`, `content_packs`, `game_events`.
6. `supabase/migrations/0006_lock_down_data_api.sql` — RLS on every public table and no table
   privileges for `anon` / `authenticated`. The API connects as `postgres` and is unaffected.
7. `supabase/migrations/0007_event_idempotency.sql` — `game_events.client_event_id` with its
   per-session unique index, and the `choice_votes` table. Apply **before** deploying an API build
   that writes them.

0006 and 0007 are idempotent and can be re-run.

Then the seed: `supabase/seed/003_sdk_games.sql` (42 SDK rows enabled, 16 legacy keys disabled).
The seed must run **after** 0005 (it inserts into the new columns). It is idempotent (upserts).

Verification (read-only):

```sql
select status, count(*) from mini_games group by status;          -- enabled 42, disabled 16
select count(*) from mini_games where status='enabled' and engine is null;  -- 0
select count(*) from content_items;  select count(*) from content_packs;
```

## 3. Content import

Bundled packs (`apps/mobile/src/game/content/packs/*.json`, 10 packs, 406 items) are the fallback
shipped in the app. Importing them makes the same content available remotely so it can be edited
without an app release.

```bash
cd backend
python -m scripts.import_content --dry-run   # validate only, writes nothing
python -m scripts.import_content             # upsert items + packs into DATABASE_URL
```

- Uses `DATABASE_URL` from the environment / `../.env` — check which database it points at first.
- Upserts by item id; re-running is safe. For `choice_pair` items the live crowd split and vote
  counts are preserved (`modules/content/crowd.py`).
- Every item goes through `modules/content/validation.py` (schema, 0..1 difficulty/popularity,
  https-only media, answer-not-in-distractors, blocklist). Any invalid item aborts the whole run.
- After import, `GET /v1/content/packs/{packId}` returns 200 with an `ETag`; before import it
  returns 404 and the app silently uses the bundled pack.

## 4. Storage buckets

Created by `0002_storage.sql`: `avatars`, `share-cards`, `exports`, `moment-media`.
The game platform itself needs **no** bucket today: all bundled content uses emoji media. Image or
audio content (`media.kind = image|audio`) must be hosted on an `https://` URL; the app caches it
through `game/platform/assetCache.ts`.

## 5. Endpoints the game platform uses

| Endpoint | Purpose |
|---|---|
| `GET /v1/feed` | Game cards (`engine`, `variation`, `config`) mixed into the feed. |
| `GET /v1/games/catalog` | Enabled SDK games (auth: guest or user token). |
| `GET /v1/content/packs/{packId}` | Remote content pack; `If-None-Match` → 304. |
| `POST /v1/games/{key}/plays` | Score submission (`Idempotency-Key`, plausibility check, clamp to `config.maxScore`). |
| `GET /v1/games/{key}/stats` | Per-game stats. |
| `POST /v1/events` | Batched gameplay analytics (≤100 events, props ≤2 KB). |

## 6. Health checks

- `GET /health` → `{"ok": true}` (Railway healthcheck, `railway.toml`).
- `GET /ready` → `{"ok": true, "database": "up"}`; 503 when the DB is unreachable. Use for uptime
  monitoring — `/health` does not touch the database.

## 7. Mobile build

- `eas.json` `production` profile carries `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_API_URL`,
  `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (publishable key) and
  `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. Without `EXPO_PUBLIC_API_URL` a production build throws on
  its first API call (`src/lib/env.ts`).
- `eas build --profile production --platform android` → AAB (version code auto-increments remotely).
- Google Sign-In in a Play-distributed build needs the Play **app signing** SHA-1 registered on the
  Android OAuth client in Google Cloud, in addition to the upload key.
- iOS: `iosUrlScheme` in `app.json` is a placeholder; iOS Google Sign-In will not work until a real
  iOS client id is configured.

## 8. Rollback

- **API:** Railway → Deployments → redeploy the previous deployment. The SDK endpoints are
  additive; rolling the API back does not break SDK clients except for `/v1/events` and content
  packs (clients tolerate both failing: analytics stays queued, content falls back to bundled).
- **Games:** disable a game without a release: `update mini_games set status='disabled' where key=...`
  (or `PATCH /v1/admin/games/{key}`). Clients hide cards they cannot resolve.
- **Content:** set `content_items.status='retired'` for bad items, or delete a pack row — the app
  falls back to its bundled pack.
- **Migrations 0005 and 0007:** additive only (new columns/tables). Do not drop them on rollback;
  older API builds ignore them.
- **Legacy games:** app builds released before the SDK cannot play SDK rows (they show "Game
  unavailable"). Re-enabling the 16 legacy rows helps only those old builds; new builds never
  play legacy keys and hide them.
