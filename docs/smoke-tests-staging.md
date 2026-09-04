# Staging smoke tests

Run against **staging** after each deploy. Do not use production data or expose test content to real users.

## API

| # | Test | Command / action | Expected |
|---|------|------------------|----------|
| 1 | Health | `GET /health` | `200`, `{ "ok": true }` |
| 2 | Readiness | `GET /ready` | `200`, `database: up` |
| 3 | Guest session | `POST /v1/guest/sessions` | `200`, token with `gst_` prefix |
| 4 | Feed | `GET /v1/feed` + Bearer guest | `200`, items array |
| 5 | Categories | `GET /v1/categories` | `200`, 11 categories |

## Moment flow

| # | Test | Expected |
|---|------|----------|
| 6 | CMS create draft moment | `201`, status draft |
| 7 | Transition ready → live | `200`, status live |
| 8 | Guest response with Idempotency-Key | `200`, duplicate returns same |
| 9 | Share card after response | `200`, HTTPS asset URL |

## Auth

| # | Test | Expected |
|---|------|----------|
| 10 | Mobile sign-in | Supabase session + `GET /v1/me` |
| 11 | Guest convert | History preserved after sign-in |
| 12 | Admin without admin_users row | `403` |
| 13 | Expired/invalid JWT | `401` |

## Games

| # | Test | Expected |
|---|------|----------|
| 14 | `POST /v1/games/higher_or_lower/plays` | Score stored |

## Worker

| # | Test | Expected |
|---|------|----------|
| 15 | Response triggers outbox | Crowd snapshot updated within ~5s |
| 16 | GDPR export queued | Worker completes; signed URL or download key set |

## Storage

| # | Test | Expected |
|---|------|----------|
| 17 | Share card URL loads PNG | Public URL 200, content-type image/png |
| 18 | Export not public | Direct bucket URL without signature → denied |

## Mark unverified

If Supabase/Fly/EAS unavailable locally, mark test **NOT VERIFIED** and record the command to run when infrastructure is available.
