# PostHog retention insights (setup checklist)

Requires a **personal API key** (`POSTHOG_KEY` / `phx_…`) in the PostHog project that receives mobile events (`EXPO_PUBLIC_POSTHOG_API_KEY`).

## 1. Retention

- Insight type: **Retention**
- Start event: `user_activated` (fallback: `game_completed` where `is_first_play = true`)
- Return event: `app_opened`
- Period: Day, lookback 30 days
- Save as: `Retention — activated → app_opened`

## 2. Activation funnel

- Insight type: **Funnel**
- Steps: `app_opened` → `onboarding_completed` → `user_activated`
- Conversion window: 1 day
- Save as: `Funnel — open → onboard → activate`

## 3. Streak + reminder health

- Insight type: **Trends** (multi-series)
  - Unique users with `streak_claimed`
  - `reminder_scheduled`
  - `reminder_opened`
  - `streak_ritual_shown` / `streak_ritual_remind`
- Save as: `Streak & reminder health`

## Property filters worth pinning

- `days_since_install`
- `is_first_session`
- `is_first_play`
- `session_number`
- `games_completed_lifetime`
