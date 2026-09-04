# Production Readiness Audit — Playbyte

**Audit date:** 2026-08-31 (updated after production-prep pass)  
**Verdict:** **NOT READY FOR STAGING**

Code and configuration hardening for deployment is substantially complete, but **staging has not been provisioned or smoke-tested against live Supabase/Fly/Vercel/EAS**. Do not promote to production until staging verification passes.

---

## Executive summary

Playbyte MVP is implemented across FastAPI, Supabase Postgres, Supabase Auth, Supabase Storage, Expo mobile, Next.js CMS, and a Postgres outbox worker. This pass focused on **production deployability** (storage, auth fail-closed, health checks, worker safety, CI, runbooks) — not new product features.

### Build verification (this machine — 2026-08-31)

| Check | Result |
|-------|--------|
| `ruff check` | **PASS** |
| `pytest` | **19 passed** (+7 storage/config/privacy tests) |
| Admin `tsc --noEmit` | **PASS** |
| Admin `next build` | **PASS** |
| Mobile `tsc --noEmit` | **PASS** |
| API against live Postgres/Supabase | **NOT VERIFIED** |
| Supabase Storage upload (live) | **NOT VERIFIED** |
| EAS production/preview build | **NOT VERIFIED** |
| Staging smoke tests | **NOT VERIFIED** |
| `pnpm audit` / dependency scan | **NOT VERIFIED** (CI runs with continue-on-error) |

---

## Fixes applied in production-prep pass

| Area | Change |
|------|--------|
| **Storage** | Supabase Storage for share cards + GDPR exports; validation, size limits, signed URLs for exports; cleanup on deletion |
| **Auth (API)** | JWT aud/exp validation; dev JWT fallback blocked in production |
| **Auth (Admin)** | `X-Admin-Key` rejected when `APP_ENV=production`; rate limit on admin auth; CMS dev key hidden when `NEXT_PUBLIC_APP_ENV=production` |
| **Production config** | Requires HTTPS `API_PUBLIC_URL`, Supabase URL + service role, no localhost DB |
| **Health** | `/health` minimal liveness; `/ready` DB ping; no env leak |
| **Worker** | SIGTERM graceful shutdown; `FOR UPDATE SKIP LOCKED` on outbox |
| **Migrations** | `0002_storage.sql` — buckets + public read policies |
| **CI** | Admin build + mobile typecheck + security audit job |
| **Docs** | `production-deployment.md`, `deployment-runbook.md`, `smoke-tests-staging.md` |
| **Mobile** | `eas.json`, bundle IDs, deep link scheme |
| **Env** | Expanded `.env.example` with per-app variable documentation |

---

## Production gate lists

### 🔴 BLOCKERS (must resolve before staging sign-off)

1. **Staging environment not provisioned** — separate Supabase project, Fly API + worker, Vercel admin, EAS preview not deployed. Run `docs/deployment-runbook.md`.
2. **Live smoke tests NOT VERIFIED** — guest → feed → respond → share card → admin go-live → auth → storage must pass against staging.
3. **Migration `0002_storage.sql` NOT VERIFIED** on staging Supabase — buckets must exist before share/export uploads work.
4. **Integration tests against real Postgres NOT VERIFIED** — unit tests only; no Testcontainers/e2e suite.

### 🟡 IMPORTANT (fix before or immediately after staging launch)

1. **Push notifications** — P1 PRD; token storage only; no APNs/FCM dispatch.
2. **Realtime on mobile** — polling only; Supabase Broadcast client not wired.
3. **Sentry / structured logging** — config vars exist; not wired.
4. **GDPR export delivery UX** — signed URL returned in worker; mobile/email delivery flow incomplete.
5. **Admin brute-force** — in-process rate limit only; add edge WAF for CMS.
6. **Dependency vulnerability scan** — run `pnpm audit` and address highs before prod.
7. **EAS project ID** — replace placeholder in `apps/mobile/app.json`.
8. **Guest token hash migration** — HMAC deploy invalidates old guest sessions.

### 🟢 ACCEPTABLE MVP LIMITATIONS

1. Client-authoritative mini-game scores.
2. In-memory rate limiter (single API instance).
3. No Redis cache; Postgres outbox instead of dedicated queue.
4. No public leaderboards (deferred).
5. No RLS on Postgres tables (API-only access model — documented).
6. Feed cursor pagination deferred.
7. Friend removal endpoint deferred.

---

## Security findings

| Finding | Status |
|---------|--------|
| Service role key in mobile/admin bundles | **PASS** — server-side only |
| Dev admin API key in production | **PASS** — blocked in API + CMS when production env |
| Dev JWT subject fallback | **PASS** — blocked when `APP_ENV=production` |
| JWT validation | **IMPROVED** — HS256 + aud + exp; optional issuer |
| Secrets in Git | **PASS** — `.env.example` placeholders only |
| CORS wildcard in production | **PASS** — startup validation rejects |
| Storage upload validation | **PASS** — type + size limits |
| PII/tokens in logs | **PASS** — no logging of secrets found |

---

## Staging readiness

### **NOT READY FOR STAGING**

**Reason:** Operational verification has not been performed. The codebase is deployable in principle, but staging go/no-go requires executing the runbook against real infrastructure.

### Exact next steps

1. Create **staging Supabase** project (separate from prod).
2. Apply migrations: `0001_init.sql`, `0002_storage.sql`.
3. Seed categories/games; bootstrap `admin_users`.
4. Deploy API + worker to Fly with staging secrets (`APP_ENV=staging` initially, then validate production config separately).
5. Deploy admin to Vercel with `NEXT_PUBLIC_APP_ENV=staging`.
6. Run `docs/smoke-tests-staging.md` checklist — mark each PASS/FAIL.
7. `eas build --profile preview` with staging `EXPO_PUBLIC_*` vars.
8. Re-run this audit with smoke test results; target **READY FOR STAGING** when all 🔴 items are verified.

---

## Tests actually run (2026-08-31)

```
cd backend && uv run ruff check app tests worker  → PASS
cd backend && uv run pytest -q                     → 19 passed
cd apps/admin && pnpm typecheck                    → PASS
cd apps/admin && pnpm build                        → PASS
cd apps/mobile && pnpm typecheck                   → PASS
```

## Tests NOT run

- Live Supabase connectivity
- Storage upload/download against real buckets
- Full guest → sign-in → convert e2e
- Admin CMS e2e against live API
- Worker against live outbox + Broadcast
- EAS build
- Load / k6 tests

---

*Update this document after staging smoke tests complete.*
