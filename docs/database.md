# Database

PostgreSQL is the system of record. Schema lives in [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql).

## Moment state machine

`DRAFT → SCHEDULED → READY → LIVE → CLOSED → RETIRED`

Restricted topics (`health`, `tragedy`, `election`) require a second distinct approver in `moment_approvals` before LIVE.

## Access patterns

- Feed: LIVE moments by `starts_at`/`ends_at`/`category_id` + enabled `mini_games`.
- Responses: unique `(moment_id, user_id)` or `(moment_id, guest_session_id)`.
- Crowd: `crowd_snapshots` updated from outbox; clients poll `GET /v1/moments/:id/result` as fallback.
- Games: `game_plays` by `game_key` + time window for percentile.
