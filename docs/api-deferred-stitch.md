# Deferred API contracts (Stitch Phase 3)

These endpoints are **not implemented**. Do not ship fake client-only UI that pretends they work.
Specs below are the minimum contract for a truthful Stitch adaptation later.

---

## 1. Notification inbox

**Purpose:** Activity inbox (rematch, challenge, view, read/unread).

| | |
|---|---|
| Method / path | `GET /v1/me/notifications` |
| Auth | User JWT required (not guest) |
| Query | `cursor?: string`, `limit?: number` (default 30, max 50), `unreadOnly?: boolean` |

**Response 200**
```json
{
  "items": [
    {
      "id": "uuid",
      "type": "rematch|challenge|view|system",
      "title": "string",
      "body": "string",
      "readAt": "iso|null",
      "createdAt": "iso",
      "deepLink": "playbyte://…",
      "metadata": {}
    }
  ],
  "nextCursor": "string|null",
  "unreadCount": 0
}
```

| | |
|---|---|
| Mark read | `POST /v1/me/notifications/{id}/read` → 204 |
| Mark all | `POST /v1/me/notifications/read-all` → `{ "unreadCount": 0 }` |
| Errors | `401 unauthorized`, `404 not_found` |

**Idempotency:** read endpoints are idempotent (repeat → same state).

---

## 2. Leaderboard

**Purpose:** Real ranks, points, scope chips (friends / global / geo).

| | |
|---|---|
| Method / path | `GET /v1/leaderboards/{scope}` |
| Auth | Guest or user |
| Path `scope` | `friends` \| `global` \| `geo` |
| Query | `period?: week\|all`, `geo?: string` (required when scope=geo), `cursor?`, `limit?` |

**Response 200**
```json
{
  "scope": "friends",
  "period": "week",
  "entries": [
    { "rank": 1, "userId": "uuid", "displayName": "…", "avatarKey": null, "points": 1200, "isYou": false }
  ],
  "you": { "rank": 12, "points": 400, "isYou": true },
  "nextCursor": null
}
```

**Errors:** `400` invalid scope/geo, `401` if friends scope without auth, `501` until implemented.

**Notes:** Do not fabricate India Rank or XP. Points source must be defined (plays, moments, or separate ledger).

---

## 3. Challenges / duels

**Purpose:** Create/accept challenges with opponent scores and completion.

| | |
|---|---|
| Create | `POST /v1/challenges` |
| Auth | User JWT |
| Headers | `Idempotency-Key` required |
| Body | `{ "opponentUserId": "uuid", "gameKey": "string", "momentId?": "uuid" }` |

**Response 201**
```json
{ "id": "uuid", "status": "pending", "createdAt": "iso", "expiresAt": "iso" }
```

| | |
|---|---|
| Accept | `POST /v1/challenges/{id}/accept` → `{ "status": "active" }` |
| Decline | `POST /v1/challenges/{id}/decline` → `{ "status": "declined" }` |
| Get | `GET /v1/challenges/{id}` → status, both scores when complete |
| List | `GET /v1/me/challenges?status=` |

**Errors:** `403` not participant, `404`, `409` already resolved, `422` unsupported gameKey.

**Idempotency:** create with same Idempotency-Key returns same challenge.

---

## 4. Friend scores (comparison)

**Purpose:** “Beat your friend” cards with real scores + timestamps.

| | |
|---|---|
| Method / path | `GET /v1/moments/{id}/friend-scores` or `GET /v1/games/{key}/friend-scores` |
| Auth | User JWT |

**Response 200**
```json
{
  "friends": [
    { "userId": "uuid", "displayName": "…", "score": 42, "optionId": "uuid|null", "playedAt": "iso" }
  ]
}
```

Empty list when no friends played — UI must hide comparison cards.

---

## 5. Likes and comments

**Purpose:** Functional Heart / Chat on feed ActionRail.

| | |
|---|---|
| Like | `POST /v1/moments/{id}/likes` (Idempotency-Key) → `{ "liked": true, "likeCount": n }` |
| Unlike | `DELETE /v1/moments/{id}/likes` → `{ "liked": false, "likeCount": n }` |
| List comments | `GET /v1/moments/{id}/comments?cursor=&limit=` |
| Add comment | `POST /v1/moments/{id}/comments` body `{ "body": "string" }` |

**Response comment item:** `{ "id", "userId", "displayName", "body", "createdAt" }`

**Errors:** `401`, `403` blocked/private, `404`, `422` empty body.

Client may optimistic-update with rollback on failure.

---

## 6. Game timers (per-question)

**Purpose:** Real timer ring + timeout behavior.

| | |
|---|---|
| Contract | Include `timeLimitMs` in game config from feed/play start |
| Optional validate | Server rejects plays submitted after `startedAt + timeLimitMs + skew` |
| Client | Show ring only when `timeLimitMs` is present and > 0 |

Without this field, **do not** render a decorative timer ring.

---

## Implementation order (recommended)

1. Likes (simplest ActionRail honesty unlock)
2. Friend scores on moments (already partially have friend option ids)
3. Notification inbox
4. Challenges
5. Leaderboard scopes with real points ledger
6. Timers if any production game requires them
