# ADR 0002 — Hybrid feed: moments + mini-games

- **Status:** Accepted
- **Date:** 2026-08-28

## Context

The PRD MVP is Predict / Pulse / Reaction moments only. The owner asked for Scrollinn-style built-in solo games in the same swipe feed, plus seasonal live windows (e.g. cricket match-day predictions).

## Decision

- Feed items are a discriminated union: `moment` | `mini_game`.
- Moments stay in `moments` / `moment_options` / `responses`.
- Games live in `mini_games` / `game_plays`; engines run on the client; server stores plays and crowd aggregates.
- Seasonal calendars use `content_windows` attached to moments.
- **No public leaderboards, XP, coins, or shop at MVP** (owner confirmed). Crowd percentile/average only.
- UI from Stitch PLAY design system, not Scrollinn chrome.

## Consequences

Feed ranking interleaves live/seasonal moments with enabled games (cadence cap during hot windows). Guest “3 engagements” prompt counts both responses and game plays.
