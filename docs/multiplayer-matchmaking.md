# Online multiplayer matchmaking — end-to-end plan

**Status:** M11 + M12 implemented (see code); M13 soft skill bands still open  

**ADR:** [0003-online-matchmaking](adr/0003-online-matchmaking.md)  
**Product constraint:** Opt-in duels stay **out of the main feed** (PRD §8.1.3). Skill ladders stay deferred until density exists.

## 1. Goal

Let a signed-in player tap **Play online** on an enabled mini-game, get matched with another online player, play the **same seed**, and see a head-to-head result.

This is **not** shared-world realtime simulation (no simultaneous maze positions, no turn protocol). It is the same fair duel model already proven by friend challenges, opened to strangers via a queue.

## 2. What already exists (reuse)

| Piece | Today | Role in multiplayer |
| ----- | ----- | ------------------- |
| Deterministic engines + `seed` | Game SDK session runner | Both players get identical content |
| `POST /v1/games/:key/plays` + `challengeId` | Attaches score to a duel | Same attach path for `matchId` |
| `challenges` table + service | Friend-only async duel | Pattern to generalize; keep friend gate intact |
| `RealtimePublisher` | Crowd snapshots only | Extend for match lifecycle events |
| Outbox worker | Async fanout | Notify opponent, expire tickets, finalize timeouts |
| Friends / Challenges UI | Accept / play / result | Mirror for Online / Matches surfaces |

## 3. Product modes

### Mode A — Quick Match (ship first)

1. Player picks a game (or “Any enabled game”).
2. Enters the queue (`searching`).
3. Server pairs two compatible tickets → creates a `match` with shared `seed`.
4. Both clients receive `match.found` (realtime or poll).
5. Each plays solo with that seed; submits play with `matchId`.
6. When both scores exist (or one times out), status → `completed` / `forfeit` and result is shown.

**Latency target:** match found in ≤ 15s when ≥ 2 searchers for the same game; otherwise cancel or keep waiting per policy below.

### Mode B — Live sync (second ship)

Same as A, plus:

- Presence heartbeats while searching and in lobby.
- `match.ready` countdown (3–5s) before both should start.
- Hard `play_deadline_at` (e.g. game duration + buffer).
- If a player disconnects before submit, mark forfeit after grace.

### Mode C — Skill bands (later)

Bucket by recent game percentile / soft MMR. Still same-seed duels. No public ranked ladder UI in this phase.

## 4. User journeys

### Happy path (Quick Match)

```text
Game card / Play Online
  → Searching (cancel anytime)
  → Match found (opponent display name + avatar)
  → Play (shared seed, challenge-style session)
  → Waiting for opponent… (if you finish first)
  → Result (you / them / win-lose-tie)
  → Rematch | Challenge friend | Back to feed
```

### Edge paths

| Case | Behavior |
| ---- | -------- |
| Cancel while searching | Ticket `cancelled`; not billed as a play |
| No opponent in N seconds | Ticket `expired`; UI offers retry / friend challenge / solo |
| Opponent never plays | After `play_deadline_at`, match `forfeit`; you keep your play, no fake opponent score |
| Double submit / retry | Idempotency on play + ticket keys (same as challenges) |
| Guest taps Play online | Prompt sign-in (matchmaking is user-only) |
| Blocked / reported user | Never re-pair with that user for a cooldown window |
| Same device / same account | Impossible (one active ticket per user) |

## 5. Domain model

### Tables (new migration)

```text
matchmaking_tickets
  id, user_id, game_key NULLABLE,   -- NULL = any enabled game
  status: searching | matched | cancelled | expired
  region TEXT NULLABLE,              -- optional soft preference
  skill_bucket INT NULLABLE,        -- reserved for Mode C
  match_id UUID NULLABLE,
  idempotency_key TEXT,
  created_at, expires_at, updated_at

matches
  id, game_key, seed,
  status: ready | playing | completed | cancelled | forfeit | expired
  player_a_id, player_b_id,         -- ordered uuid pair for uniqueness helpers
  play_a_id, play_b_id,             -- FKs to game_plays
  ticket_a_id, ticket_b_id,
  found_at, ready_at NULLABLE,
  play_deadline_at NULLABLE,
  completed_at NULLABLE,
  created_at, updated_at

match_events (optional audit / debug)
  id, match_id, kind, payload JSONB, created_at
```

Also:

```text
ALTER TABLE game_plays ADD COLUMN match_id UUID REFERENCES matches(id);
UNIQUE (match_id, user_id) WHERE match_id IS NOT NULL;
```

Friend `challenges` remain unchanged and friend-gated.

### Why not overload `challenges`?

Friend challenges require accept/decline, 7-day TTL, and friendship checks. Online matches need queue pairing, short deadlines, and no social graph. Shared **helpers** (seed, serialize scores, attach play) — separate **tables**.

## 6. API surface

All routes require signed-in user (not guest).

| Method | Path | Purpose |
| ------ | ---- | ------- |
| POST | `/v1/matchmaking/tickets` | Enqueue (`gameKey?`, `Idempotency-Key`) → ticket |
| DELETE | `/v1/matchmaking/tickets/:id` | Cancel searching |
| GET | `/v1/matchmaking/tickets/:id` | Poll ticket + embedded match stub |
| GET | `/v1/matches/:id` | Full match + scores + opponent profile |
| POST | `/v1/matches/:id/forfeit` | Explicit leave after match found |
| GET | `/v1/me/matches` | Recent online matches |

Play submit extension:

```text
POST /v1/games/:key/plays
body: { ..., matchId?: uuid }   // mutually exclusive with challengeId
```

Server validates: user is player on match, game_key matches, seed matches play meta when present, one play per (match, user).

## 7. Matchmaking algorithm (P0)

Worker or API transactional loop (Postgres):

1. Claim up to N `searching` tickets with `FOR UPDATE SKIP LOCKED` where `expires_at > now()`.
2. Group by `game_key` (resolve `NULL` any-game by picking the most popular searching key in the batch, else first enabled).
3. Pair FIFO within a group; skip pairs that share a recent block or active match.
4. Insert `matches` row (`status=ready`, new seed, deadlines).
5. Mark both tickets `matched`, set `match_id`.
6. Enqueue outbox: `match.found` for both user channels.

**Concurrency:** one matcher loop (worker cron every 1s) is enough at early scale. Horizontal API instances must not each run ad-hoc pairers without advisory locks.

**Cold start policy (product default):**

- Search window: **20s** default, client can extend once.
- No bot opponents.
- On expire: return `{ code: "no_opponent" }` and suggest friend challenge / solo.

## 8. Realtime & presence

### Channels

| Channel | Events |
| ------- | ------ |
| `user:{userId}` (private) | `match.found`, `match.ready`, `match.result`, `match.cancelled` |
| Optional `match:{matchId}` | Lobby countdown ticks (Mode B) |

Extend `RealtimePublisher`:

```python
async def publish_user_event(self, user_id: str, event: str, payload: dict) -> None: ...
```

Failures never block match writes; clients keep polling `GET /v1/matchmaking/tickets/:id` every 1–2s while searching and `GET /v1/matches/:id` while waiting for opponent score.

### Presence (Mode B)

- Client heartbeats `POST /v1/matchmaking/heartbeat` every 5s while searching / lobby.
- Ticket without heartbeat for 15s → drop from queue.
- Do not build a global “who’s online” directory for v1.

## 9. Mobile UX plan

### Entry points (opt-in only)

1. Post-game result: **Play online** beside **Challenge a friend**.
2. Friends / Play tab section: **Online matches** list (searching / your turn / results).
3. Game detail / feed game chrome: secondary CTA, never the primary feed swipe action.

### Screens / states

| State | UI |
| ----- | -- |
| Searching | Full-screen or sheet with spinner, game title, cancel |
| Match found | Opponent name/avatar, “Get ready”, then auto-start session with seed |
| Playing | Existing `GameHost` with `seed` + `matchId` on complete |
| Waiting | “Waiting for {name}…” with poll |
| Result | Reuse challenge result summary (win / lose / tie / forfeit) |

### Session wiring

Reuse challenge path in `GameHost` / `CompletedPlay`:

- Today: `challengeId` + shared seed, skip recent-content avoidance.
- Add: `matchId` with the same seed fidelity rules.

i18n keys: `playOnline`, `searchingOpponent`, `matchFound`, `waitingForOpponent`, `rematch`, `noOpponent`, etc. (en + hi).

## 10. Economy, stats, trust

| Concern | Rule |
| ------- | ---- |
| Coins / streak | Product choice: either grant normal play rewards once per match play, or a smaller “duel” grant — **do not double-grant** on rematch idempotent replay |
| Participation recap | Match outcomes **do not** become named head-to-head in weekly recap (PRD recap rule); aggregate “duels played” is OK if product wants |
| Leaderboards | Friend/global boards stay play aggregates; no matchmaking Elo board in P0/P1 |
| Safety | Report opponent from result screen; pairing block list |
| Fairness | Existing `implausible_play` checks; reject score if `meta.seed` ≠ match seed |
| Privacy | Opponent sees displayName + avatarKey only |

## 11. Backend module layout

```text
backend/app/modules/matchmaking/
  service.py      # enqueue, cancel, pair, expire
  matches.py      # serialize, attach_play, forfeit, complete
  presence.py     # Mode B heartbeats

backend/app/api/v1/matchmaking.py
backend/app/api/v1/matches.py

worker handlers:
  matchmaking.pair
  matchmaking.expire_tickets
  matchmaking.finalize_deadlines
  matchmaking.notify
```

Share pure helpers with challenges where useful (`_new_seed`, score load, player stub).

## 12. Implementation phases

### Phase 0 — Spec & flags (this PR)

- ADR + this plan.
- Feature flag `ONLINE_MATCHMAKING_ENABLED` (API + mobile remote/config later).

### Phase 1 — Quick Match vertical slice

**Backend**

1. Migration for tickets / matches / `game_plays.match_id`.
2. Enqueue + cancel + poll APIs.
3. Worker pairing with `SKIP LOCKED`.
4. Attach play on submit; complete match; serialize result.
5. Unit tests mirroring `test_challenges.py` / API smoke.

**Mobile**

1. `lib/matchmaking.ts` API client + types in `packages/api-client`.
2. Searching sheet + wire `GameHost` with `matchId`.
3. Result summary reuse from challenge outcome.
4. Entry CTA behind flag.

**Acceptance**

- Two signed-in clients on staging enqueue same `gameKey` → both get same `match.id` + `seed` within 5s.
- Both submit → identical win/lose/tie on both devices.
- Cancel removes ticket; second player eventually expires cleanly.

### Phase 2 — Live sync polish

1. Heartbeats + lobby countdown events.
2. `play_deadline_at` forfeit finalizer.
3. Rematch (creates linked tickets preferring the same opponent once).
4. Push notification when opponent finishes (if push is live).

### Phase 3 — Density & skill

1. Soft skill buckets from recent percentile.
2. Cross-game “Any” matching improvements.
3. Metrics: queue time p50/p95, match complete rate, cancel rate, report rate.
4. Only then consider ranked presentation.

## 13. Observability & ops

| Metric | Why |
| ------ | --- |
| `matchmaking_queue_depth{game}` | Cold-start / capacity |
| `matchmaking_time_to_match_ms` | UX SLA |
| `match_complete_rate` | Drop-off |
| `match_forfeit_rate` | Abuse / disconnects |
| `matchmaking_pair_errors` | Worker health |

Alerts: queue depth high with time-to-match p95 > 20s; worker pairing lag.

## 14. Test plan

| Layer | Cases |
| ----- | ----- |
| Unit | Pair FIFO, skip blocked pair, idempotent enqueue, attach play once, deadline forfeit |
| API | Guest 401, cancel, poll transitions, mutual exclusion `challengeId`/`matchId` |
| Integration | Two users + worker tick → match → dual submit → result |
| Mobile harness | Seed fidelity with `matchId`; no recent-content avoidance |
| Load | 100 concurrent searchers on one game_key; no double-matching |

## 15. Explicit non-goals (for this initiative)

- Shared realtime board state / lockstep inputs
- Redis-required matching (may come later behind an interface)
- Ranked ladders / seasons / trophies
- Injecting match CTAs into the primary swipe feed
- Guest matchmaking
- Bot / NPC fillers as default opponents
- Real-money or wagering framing

## 16. Rollout checklist

1. Land schema behind flag (API returns 404/403 when disabled).
2. Staging soak with internal accounts.
3. Enable for a single high-traffic game_key.
4. Watch queue depth and complete rate for 48h.
5. Expand game list; then Mode B countdown.
6. Document runbook: expire stuck tickets, disable flag, replay worker.

## 17. Suggested milestone mapping

Add to [implementation-plan.md](implementation-plan.md):

| ID | Description |
| -- | ----------- |
| M11 | Online Quick Match (queue + matches + mobile CTA) |
| M12 | Live sync lobby + deadlines + rematch |
| M13 | Soft skill bands + density metrics (optional) |

---

## Appendix A — Sequence (Quick Match)

```text
Client A                API / DB                 Worker              Client B
   |--POST ticket------->|                         |                    |
   |<------ticket id-----|                         |                    |
   |                     |<--POST ticket-----------|--------------------|
   |                     |                         |--pair SKIP LOCKED->|
   |                     |<-----create match-------|                    |
   |<-poll / realtime----|                         |----notify--------->|
   |--play + submit----->|                         |                    |
   |                     |                         |                    |--play + submit-->|
   |                     |--complete match---------|                    |
   |<-match.result-------|                         |----match.result--->|
```

## Appendix B — Open product decisions (defaults chosen)

| Question | Default in this plan |
| -------- | -------------------- |
| Search timeout | 20s + one client extend |
| Any-game queue | Allowed; resolve at pair time |
| Rematch | Phase 2 |
| Coins on duel play | Same as solo play, once |
| Show opponent while searching | No (only after match) |
| Cross-region | Ignore region in P0 |
