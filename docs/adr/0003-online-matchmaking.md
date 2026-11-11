# ADR 0003 — Online matchmaking for mini-games

- **Status:** Proposed
- **Date:** 2026-11-11

## Context

Maja already ships **async friend challenges**: two friends share a deterministic `seed`, each submits a `game_plays` row, and the server compares scores ([`0011_challenges.sql`](../../supabase/migrations/0011_challenges.sql)).

Players also want to **match with other online players** they do not know. The PRD listed skill-based matchmaking as out of MVP scope, but opt-in duels are an explicit V1.1/V2 attachment point. Engines are client-side and seed-deterministic, so shared-state turn engines are a poor first fit.

## Decision

1. **Multiplayer v1 = same-seed score duel with strangers**, not shared-board realtime simulation.
2. Add a dedicated **matchmaking queue + matches** module that *reuses* the challenge play/seed/result contract (attach play → compare scores), rather than inventing a second scoring path.
3. Ship in phases:
   - **P0 Quick Match** — queue → pair → shared seed → each plays independently (near-live if both online; async fallback if one drops).
   - **P1 Live sync** — match-found + countdown + simultaneous play window + presence heartbeats.
   - **P2 Skill bands** — soft MMR / recent percentile buckets only after density exists. No ranked ladder UI until product asks.
4. Keep matchmaking **opt-in and off the main feed** (PRD §8.1.3). Require signed-in users. Guests stay solo.
5. Prefer **Postgres `SKIP LOCKED` queue + outbox + RealtimePublisher** over introducing Redis for matching. Redis remains a later scaling option behind the same service interface.
6. Extend `RealtimePublisher` with match events (`match.found`, `match.ready`, `match.result`, `match.cancelled`); clients poll match status as fallback (same pattern as crowd snapshots).

## Consequences

- Friend challenges stay friend-gated; online matches are a sibling domain (`matches` / `matchmaking_tickets`) that can share serialization helpers with challenges.
- Fairness inherits seed determinism + existing play plausibility checks; anti-cheat stays server-side score acceptance, not client trust.
- Cold queues need a product policy (wait, expand game pool, or cancel) — bots/ghost opponents are **not** default.
- Participation stats / economy grants for matched plays must be product-gated so duel outcomes do not redefine the participation-first feed.
