# Playbyte architecture (implementation)

Architecture v1.2 remains the technical source of truth except for documented ADRs.

## Deviations

1. Backend is **FastAPI (Python)** not NestJS — [ADR 0001](adr/0001-python-fastapi-backend.md).
2. Feed includes **mini-games + content windows** — [ADR 0002](adr/0002-hybrid-feed-moments-and-minigames.md).
3. Client is **Expo React Native** (Architecture), not separate native codebases (PRD wording).
4. UI brand in Stitch is **PLAY**; product name is Playbyte. MVP nav: Feed · Live · Friends · Profile. Leaderboards deferred.

## Runtime

```text
Expo / Next.js admin
        |
     HTTPS /v1
        v
 FastAPI modular monolith
        |
        +-- PostgreSQL (system of record)
        +-- Outbox worker
        +-- RealtimePublisher (Broadcast or no-op + poll)
        +-- Supabase Auth / Storage (when configured)
```

## Non-negotiables (Architecture §24)

Postgres is source of truth. No privileged client writes. No Postgres Changes for crowd fanout. Versioned crowd snapshots. Idempotent responses. Server-side authorization. Retry-safe async work.
