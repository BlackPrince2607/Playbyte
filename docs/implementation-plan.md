# Playbyte implementation plan

Living checklist. Status: `[ ]` not started · `[-]` in progress · `[x]` complete · `[!]` blocked.

Product: hybrid swipe feed (live moments + mini-games). Backend: FastAPI. UI: Stitch PLAY. Leaderboards: post-MVP.

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

## Engineering decisions

- FastAPI instead of NestJS ([ADR 0001](adr/0001-python-fastapi-backend.md)).
- Hybrid feed ([ADR 0002](adr/0002-hybrid-feed-moments-and-minigames.md)).
- Local Postgres via Docker; Supabase for hosted Auth/Storage/Broadcast.
- Queue: Postgres `outbox_events` + worker (no Redis at MVP).
- Guest prompt after 3 engagements (responses + game plays), server-side.
- Leaderboards deferred (owner).

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
