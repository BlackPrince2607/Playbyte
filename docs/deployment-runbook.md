# Deployment runbook

Use this sequence for **staging first**, then production after go/no-go.

## Prerequisites

- Supabase staging project created (separate from production)
- Fly.io apps (or equivalent) for API + worker
- Vercel project for admin
- EAS project for mobile
- Secrets generated (32+ char random for `GUEST_TOKEN_SECRET`, `ADMIN_API_KEY`)

---

## 1. Provision infrastructure

1. Create Supabase project for target environment.
2. Create Fly apps: `playbyte-api-staging`, `playbyte-worker-staging` (rename for prod).
3. Create Vercel project linked to `apps/admin`.
4. Create/link EAS project for `apps/mobile`.

## 2. Configure secrets

Set in Fly (API + worker):

```
APP_ENV=staging
DATABASE_URL=postgresql+asyncpg://...
API_PUBLIC_URL=https://api-staging.playbyte.app
CORS_ORIGINS=https://admin-staging.playbyte.app
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=...
SUPABASE_JWT_AUDIENCE=authenticated
GUEST_TOKEN_SECRET=<random 40+>
ADMIN_API_KEY=<random 40+>  # automation only
```

Set in Vercel:

```
NEXT_PUBLIC_APP_ENV=staging
NEXT_PUBLIC_API_URL=https://api-staging.playbyte.app
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Set in EAS (staging profile):

```
EXPO_PUBLIC_APP_ENV=staging
EXPO_PUBLIC_API_URL=https://api-staging.playbyte.app
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

## 3. Configure Supabase

1. Enable Auth (email/password at minimum).
2. Note JWT secret from Project Settings → API.
3. Configure backup/PITR (see `docs/runbooks/backups.md`).

## 4. Apply migrations

```bash
# From repo root, against linked project:
supabase db push

# Or manually in SQL editor, in order:
# supabase/migrations/0001_init.sql
# supabase/migrations/0002_storage.sql
```

Verify: `\dt` shows 28+ tables; `storage.buckets` has share-cards, avatars, exports.

## 5. Seed appropriate data

**Staging:** categories + mini-games + sample moments (optional):

```bash
supabase db query --linked --file supabase/seed/001_categories_and_games.sql
supabase db query --linked --file supabase/seed/002_sample_moments.sql
```

**Production:** seed categories/games only — editorial content via CMS.

## 6. Bootstrap admin user

After first Supabase Auth sign-up:

```sql
INSERT INTO admin_users (user_id, role)
SELECT id, 'editor' FROM users WHERE auth_subject = '<supabase-user-uuid>';
```

## 7. Deploy backend

```bash
cd backend
fly deploy --config fly.toml  # after copying fly.toml.example
```

Verify:

```bash
curl https://api-staging.playbyte.app/health
curl https://api-staging.playbyte.app/ready
```

## 8. Deploy worker

Deploy same image with command override:

```
python -m worker.main
```

Verify worker logs show outbox processing (no crash loop).

## 9. Deploy admin

Push to main → Vercel preview/production, or:

```bash
pnpm --filter @playbyte/admin build
```

Open CMS URL → Supabase sign-in → create test moment draft.

## 10. Build mobile

```bash
cd apps/mobile
eas build --profile preview --platform all
```

Install on test device with staging env vars.

## 11. Smoke tests

Run checklist in `docs/smoke-tests-staging.md` (or inline below):

- [ ] `GET /health` → 200
- [ ] `GET /ready` → 200, database up
- [ ] `POST /v1/guest/sessions` → token
- [ ] `GET /v1/feed` with guest token → items
- [ ] Respond to moment → 200
- [ ] Play mini-game → score persisted
- [ ] Sign in on mobile → profile loads
- [ ] Admin login → create moment → go live
- [ ] Share card → URL returns PNG (Supabase or local)
- [ ] GDPR export queues → worker completes

## 12. Verify monitoring

- Uptime check on `/health`
- Error tracking DSN set (optional but recommended)
- Alert on worker process exit

## 13. Verify authentication

- Guest token rejected when expired
- Invalid JWT → 401
- Non-admin JWT → 403 on `/v1/admin/*`
- Admin API key rejected when `APP_ENV=production`

## 14. Verify database

- Migrations applied
- No manual-only objects missing
- Backups enabled in Supabase dashboard

## 15. Go / no-go

| Gate | Required |
|------|----------|
| All smoke tests pass | Yes |
| No 🔴 blockers in audit | Yes |
| Staging mirrors prod config | Yes |
| Rollback plan documented | Yes |

**Decision:** READY FOR STAGING / NOT READY FOR STAGING

---

## Rollback

1. **API/Worker:** `fly releases list` → `fly releases rollback`
2. **Admin:** Vercel → Promote previous deployment
3. **Mobile:** Ship previous EAS build to testers; store rollback is separate
4. **Database:** Do not drop tables. Restore from Supabase PITR only if migration caused data loss.

## Production promotion

Repeat this runbook against production Supabase + Fly + Vercel + EAS with `APP_ENV=production` and production URLs. Require explicit approval — CI does **not** auto-deploy to production.
