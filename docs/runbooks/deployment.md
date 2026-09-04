# Deployment

## Environments

| Env | API | DB | Admin | Mobile |
| --- | --- | -- | ----- | ------ |
| development | localhost:8000 | Docker Postgres | localhost:3000 | Expo |
| staging | Fly.io | Supabase staging | Vercel preview | EAS preview |
| production | Fly.io | Supabase production | Vercel | EAS production |

Never point development at production databases.

## Checklist

1. Apply `supabase/migrations` to the target database.
2. Seed categories/games in non-prod; editorial content via CMS in prod.
3. Set secrets from `.env.example` in the secret manager (Fly/Vercel/EAS).
4. Deploy API + worker.
5. Deploy admin.
6. Smoke: `GET /health`, guest session, feed, respond, CMS go-live.
7. Production promotion is explicit (no deploy-from-laptop).

## Rollback

Redeploy the previous Fly/Vercel/EAS release. Database migrations are additive; do not drop production tables as part of rollback without a restore plan.

## Verification

- `/health` returns `{ ok: true }`
- Guest can fetch feed
- Response is idempotent with `Idempotency-Key`
- Restricted moment cannot go live without two approvals
