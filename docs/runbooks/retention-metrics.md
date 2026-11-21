# Retention metrics runbook (Maja)

**Timezone for day boundaries:** `Asia/Kolkata` (IST).

**Activated user:** finished ≥1 `game_plays` row (signed-in) on their first play day. Product analytics also emits one-shot `user_activated` after the first `game_completed` post-onboarding.

## North-star

| Metric | Baseline (2026-11-21) | Target |
|--------|----------------------|--------|
| D1 game return (activated) | ~7% (3/42) | ≥20% |
| Streak ≥2 share | 9/84 streak rows | ≥40% of active streaks |
| Any return within 7d | 5/20 | ≥35% |

## Postgres queries

Connect with `DATABASE_URL` (read-only preferred).

### D1 / D7 from game plays

```sql
WITH first_day AS (
  SELECT user_id, (min(created_at) AT TIME ZONE 'Asia/Kolkata')::date AS d0
  FROM game_plays WHERE user_id IS NOT NULL
  GROUP BY user_id
),
active AS (
  SELECT DISTINCT user_id, (created_at AT TIME ZONE 'Asia/Kolkata')::date AS d
  FROM game_plays WHERE user_id IS NOT NULL
)
SELECT
  count(*) AS activated_players,
  count(*) FILTER (WHERE d0 <= (now() AT TIME ZONE 'Asia/Kolkata')::date - 1) AS eligible_d1,
  count(*) FILTER (WHERE d0 <= (now() AT TIME ZONE 'Asia/Kolkata')::date - 1
    AND EXISTS (SELECT 1 FROM active a WHERE a.user_id = f.user_id AND a.d = f.d0 + 1)) AS returned_d1,
  count(*) FILTER (WHERE d0 <= (now() AT TIME ZONE 'Asia/Kolkata')::date - 7) AS eligible_d7,
  count(*) FILTER (WHERE d0 <= (now() AT TIME ZONE 'Asia/Kolkata')::date - 7
    AND EXISTS (SELECT 1 FROM active a WHERE a.user_id = f.user_id AND a.d = f.d0 + 7)) AS returned_d7,
  count(*) FILTER (WHERE d0 <= (now() AT TIME ZONE 'Asia/Kolkata')::date - 7
    AND EXISTS (SELECT 1 FROM active a WHERE a.user_id = f.user_id AND a.d > f.d0 AND a.d <= f.d0 + 7)) AS returned_within_d7
FROM first_day f;
```

### Streak health

```sql
SELECT
  count(*) AS streak_rows,
  count(*) FILTER (WHERE current_count >= 2) AS streak_ge2,
  count(*) FILTER (WHERE current_count >= 3) AS streak_ge3,
  round(avg(current_count)::numeric, 2) AS avg_current,
  round(avg(best_count)::numeric, 2) AS avg_best
FROM user_streaks;
```

### One-and-done players

```sql
WITH days AS (
  SELECT user_id, count(DISTINCT (created_at AT TIME ZONE 'Asia/Kolkata')::date) AS active_days
  FROM game_plays WHERE user_id IS NOT NULL
  GROUP BY user_id
)
SELECT active_days, count(*) AS users FROM days GROUP BY 1 ORDER BY 1;
```

## Remeasure script

From repo root (requires `DATABASE_URL` and `psycopg`):

```bash
python scripts/remeasure_retention.py
```

Re-run **7–14 days** after shipping streak reminder + day-0 ritual. If activated D1 clears ~20%, invest in remote push (FCM/APNs); otherwise iterate reminder copy/timing and day-0 ritual.

## PostHog

1. Set a **personal API key** in root `.env` as `POSTHOG_KEY` (Settings → Personal API Keys). Project key `EXPO_PUBLIC_POSTHOG_API_KEY` only captures events.
2. Create insights:
   - **Retention:** returning users on `app_opened` (or cohort from `user_activated`).
   - **Activation funnel:** `app_opened` → `onboarding_completed` → `game_completed` / `user_activated`.
   - **Streak health:** daily unique users with `streak_claimed`, plus `reminder_scheduled` → `reminder_opened`.
3. Filter properties: `is_first_play`, `days_since_install`, `session_number`, `is_first_session`.

## Product events added for retention

| Event | When |
|-------|------|
| `user_activated` | First `game_completed` lifetime |
| `streak_claimed` / `streak_broken` | Economy streak sync |
| `reminder_*` | Local streak reminder permission / schedule / open |
| `streak_ritual_*` | Day-0 streak sheet |
| `daily_featured_*` | Today’s challenge banner |
| `friend_challenge_prompt_*` | Soft challenge/invite after a strong score |
