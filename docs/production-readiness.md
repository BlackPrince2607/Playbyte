# Production Readiness — Playbyte

**Date:** 2026-09-21  
**Overall readiness:** **Tester Ready (conditional)** — core guest feed/respond/play work on live API; **not Production Ready**.

Share journey and storage ops remain blockers for full E2E sign-off. Security gate requires confirming PostgREST lockdown.

---

## Gate results

| Gate | Result | Notes |
|------|--------|-------|
| 1 — Build | 🟡 Partial | Backend pytest **33 PASS**; ruff **PASS**; mobile/admin `tsc` **PASS**; api-client `tsc` via `pnpm typecheck` fails if `tsc` not on PATH (use `pnpm exec`); Android/iOS EAS build **NOT RUN** this pass |
| 2 — Core functionality | 🟡 | API guest/feed/respond/games PASS; share FAIL; device onboarding/gamesplay 🧪 |
| 3 — Backend | 🟡 | Core APIs PASS; share-card 500; errors safe (no stack to client) |
| 4 — Security | 🟡 | No secrets in mobile; admin key blocked in production config tests; **confirm** Data API / no table RLS posture |
| 5 — E2E | 🔴 | Journey D blocked; device journeys not executed |
| 6 — Tester distribution | 🟡 | Preview env in `eas.json`; rebuild recommended after mobile truthfulness fixes |
| 7 — Production | 🔴 | Monitoring (Sentry) unwired; share storage broken; staging/prod promotion checklist incomplete |

**Release recommendation:** Ship **internal/external preview testers** for feed + games + auth after documenting share as broken. **Do not** mark production-ready until P0 storage + security confirmation + device Journey A pass.

---

## Status by area

| Area | Status |
|------|--------|
| Build / types | Mobile & admin typecheck PASS (local `pnpm exec tsc`) |
| API | Health, guest, feed, respond, result, games PASS |
| Database | Ready ping PASS |
| Security | Config tests PASS; operational PostgREST check required |
| Performance | Not load-tested this pass |
| Deployment | Railway live; worker not verified this pass |
| Monitoring | Sentry not wired |
| Sharing | **Broken** on live |

---

## Production blockers (evidence-based)

1. **`POST /v1/moments/{id}/share-card` → 500** on Railway (smoke 2026-09-21). Ops: apply `0002_storage.sql`, verify service role, redeploy (see `docs/runbooks/share-card-storage.md`).  
2. **Supabase Data API without table RLS** — if PostgREST is reachable with anon/authenticated keys, data is exposed. Must verify project settings before production.  
3. **EAS production profile** lacks in-repo `EXPO_PUBLIC_API_URL` / Supabase vars — must be supplied at build time or production mobile build fails/`assertMobileEnv`.  
4. **Device E2E not signed off** — cannot claim full guest journey on-device.

---

## Environment matrix

| Variable / setting | Local | Preview (EAS) | Production | Required? | Verified? |
|--------------------|-------|---------------|------------|-----------|-----------|
| `EXPO_PUBLIC_API_URL` | localhost:8000 default | Railway URL in `eas.json` | Must set at build | Yes (non-dev) | Preview in-repo |
| `EXPO_PUBLIC_SUPABASE_URL` | .env | In `eas.json` | Build-time | Yes for auth | Preview in-repo |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | .env | In `eas.json` | Build-time | Yes for auth | Preview in-repo |
| `EXPO_PUBLIC_APP_ENV` | development | staging | production | Yes | Yes |
| `DATABASE_URL` | docker/local | Railway | Railway/Fly | Yes | Ready PASS |
| `GUEST_TOKEN_SECRET` | .env | Railway | Railway | Yes | Indirect (guest works) |
| `SUPABASE_SERVICE_ROLE_KEY` | .env | Railway | Railway | Yes for storage | **Suspect** (share 500) |
| `SUPABASE_STORAGE_BUCKET_SHARES` | share-cards | default | default | Optional | Unverified |
| `APP_ENV` | development | staging/prod | production | Yes | Unverified on Railway |
| `CORS_ORIGINS` | * / local | Hosted | Explicit HTTPS | Prod yes | Config tests |
| `SENTRY_DSN` | optional | optional | recommended | No | Not wired |
| `ADMIN_API_KEY` | local only | non-prod | Must not unlock prod | — | Code blocks in production |
| Android package / iOS bundle | `app.playbyte.mobile` | same | same | Yes | In `app.json` |
| EAS projectId | set | set | set | Yes | In `app.json` |

---

## Fixes in this audit pass

| Fix | Why |
|-----|-----|
| Feed serialize test fixtures | Restored green tests after `scoring_mode` / `prompt_image_key` |
| Share-card maps config/upload failures → 503 | Honest client errors after redeploy |
| `tests/test_sharing.py` | Covers 403 / 503 / PNG render |
| Friends fabricated scores removed | Truthful UX |
| Post-game fake XP / session rank removed | Score + percentile only |
| Post-game Challenge → Sign-In removed | No misleading CTA |
| `scripts/smoke_api.py` | Reproducible live API checks |

---

## Final verification commands (this machine)

```text
cd backend && python -m uv run pytest -q          → 33 passed
cd backend && python -m uv run ruff check app tests worker → All checks passed
cd apps/mobile && pnpm exec tsc --noEmit          → PASS (exit 0)
cd apps/admin && pnpm exec tsc --noEmit           → PASS (exit 0)
python scripts/smoke_api.py                       → 11/12 PASS (share FAIL)
EAS Android/iOS build                             → NOT RUN
Device E2E                                        → NOT RUN
```

---

## Next steps (exact order)

1. Ops: create/fix `share-cards` bucket + Railway Supabase env → redeploy API.  
2. Re-run `python scripts/smoke_api.py` until share PASS.  
3. Confirm Supabase Data API locked down.  
4. `eas build --profile preview --platform android` with current mobile fixes.  
5. Execute Journey A–E on device; update this doc gate 5–6 to PASS.  
6. Only then promote production EAS + production env matrix.
