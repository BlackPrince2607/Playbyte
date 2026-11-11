# Maja implementation plan

Living checklist. Status: `[ ]` not started · `[-]` in progress · `[x]` complete · `[!]` blocked.

Product: hybrid swipe feed (live moments + mini-games). Backend: FastAPI. UI: Stitch design system (MAJA). Leaderboards: post-MVP.

## Milestones

| ID | Description | Status |
| -- | ----------- | ------ |
| M1 | Project foundation | `[x]` |
| M2 | Database schema + seed | `[x]` |
| M3 | FastAPI foundation | `[x]` |
| M4 | Core APIs (guest, feed, responses, games, crowd) | `[x]` |
| M5 | Admin CMS | `[x]` |
| M6 | Mobile Stitch shell + feed | `[x]` |
| M6b | Mini-game pack | `[x]` |
| M7 | Auth, conversion, profile | `[x]` |
| M8 | Friends, share, push, recap, GDPR | `[x]` |
| M9 | Tests / hardening | `[x]` |
| M10 | CI/CD and production docs | `[x]` |
| M11 | Online Quick Match (stranger same-seed duels) | `[x]` |
| M12 | Live sync lobby + deadlines + rematch | `[x]` |
| M13 | Soft skill bands for matchmaking (optional) | `[ ]` |

## Engineering decisions

- FastAPI instead of NestJS ([ADR 0001](adr/0001-python-fastapi-backend.md)).
- Hybrid feed ([ADR 0002](adr/0002-hybrid-feed-moments-and-minigames.md)).
- Online matchmaking reuses same-seed score duels, not shared-board realtime ([ADR 0003](adr/0003-online-matchmaking.md)); full plan in [multiplayer-matchmaking.md](multiplayer-matchmaking.md).
- Local Postgres via Docker; Supabase for hosted Auth/Storage/Broadcast.
- Queue: Postgres `outbox_events` + worker (no Redis at MVP); matchmaking also Postgres `SKIP LOCKED` until density requires Redis.
- Guest prompt after 3 engagements (responses + game plays), server-side.
- Leaderboards deferred (owner); ranked matchmaking ladders stay deferred past M12.

## Task checklist

- [x] M1-T1 Monorepo layout, env, Docker, README
- [x] M2-T1 Init SQL + seed
- [x] M3-T1 FastAPI app, errors, auth deps
- [x] M4-T1 Guest/feed/respond/games
- [x] M5-T1 Admin CMS
- [x] M6-T1 Expo feed
- [x] M6b-T1 Eight mini-games
- [x] M7-T1 Profile + convert
- [x] M8-T1 P1 APIs + screens
- [x] M9-T1 pytest + CI
- [x] M10-T1 Deploy/runbooks
- [x] M11-T1 Matchmaking schema + enqueue/pair/cancel APIs + play `matchId`
- [x] M11-T2 Mobile Play online CTA, searching UI, GameHost `matchId`, result reuse
- [ ] M11-T3 Staging two-client soak + feature flag
- [x] M12-T1 Presence heartbeats, countdown, play deadlines, rematch
- [ ] M13-T1 Soft skill buckets + queue metrics (optional)
