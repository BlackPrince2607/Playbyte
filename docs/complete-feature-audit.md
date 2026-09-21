# Complete Feature Audit — Playbyte

**Audit date:** 2026-09-21  
**Method:** Code inspection + live Railway API smoke (`scripts/smoke_api.py`) + backend unit tests.  
**Mobile UI journeys:** Code-path verified; device E2E not executed in this pass.

Statuses: ✅ Verified · 🟡 Partial · 🔴 Broken · ⚪ Missing · 🧪 Needs external/device test · 🚧 Deferred

---

## Technical map

| Area | Key files | Status | Dependencies | Risks |
|------|-----------|--------|--------------|-------|
| Authentication | `apps/mobile/src/context/AuthContext.tsx`, `api.ts`, `backend/app/common/auth.py`, `api/v1/guest.py`, `api/v1/me.py` | 🟡 | Supabase Auth, guest HMAC | Guest convert errors swallowed; Google OAuth not wired |
| Feed | `AppContext.tsx`, `FeedScreen.tsx`, `MomentFeedPage.tsx`, `modules/feed/` | ✅ API | DB moments + crowd | No cursor pagination; friend avatars can fall back to global list |
| Moments respond/result | `modules/responses/`, `api/v1/moments.py` | ✅ API | Idempotency-Key, crowd snapshot | Optimistic count vs worker rebuild race |
| Games (8 live / 16 client) | `games/registry.tsx`, `engines/*`, `modules/games/` | 🟡 | Server `enabled` seed | Client has 16 engines; production seed enables **8** |
| Sharing | `modules/sharing/`, storage, `MomentFeedPage` | 🔴 live | Supabase `share-cards` bucket + service role | Live `POST …/share-card` → **500**; local maps to **503** after redeploy |
| Friends | `FriendsScreen.tsx`, `modules/friends/` | 🟡 | Auth required | No remove/block; fabricated scores **removed** this pass |
| Compete / Live Now | `LiveNowScreen.tsx` | 🟡 | Same feed | No dedicated live API; filters open moments |
| Vault / Settings | `SettingsScreen.tsx`, `api/v1/me.py` | ✅ | User JWT | Help/guidelines stubbed |
| Notifications | `NotificationsScreen.tsx` | 🟡 | Prefs API | Push delivery not implemented |
| Weekly Recap | `WeeklyRecapScreen.tsx`, `modules/recap/` | ✅ | User JWT | — |
| Billing | — | ⚪ | — | Not in MVP |
| Admin CMS | `apps/admin`, `api/v1/admin.py` | 🧪 | Admin JWT / non-prod key | Not smoke-tested this pass |
| DB / RLS | `supabase/migrations/*` | 🟡 | API-only model | **No table RLS**; storage SELECT policies only |
| Deploy | Railway `railway.toml`, EAS `eas.json` | 🟡 | Env secrets | Share storage misconfig on Railway; prod EAS env incomplete in-repo |

---

## Onboarding

| Feature | Status | Test | Notes / files |
|---------|--------|------|---------------|
| Welcome | ✅ code | 🧪 device | `WelcomeScreen.tsx`; Google CTA says soon / continues guest |
| Get Started | ✅ code | 🧪 | `GetStartedScreen.tsx` |
| Language | ✅ code | 🧪 | Local storage only; UI stays English |
| Interests | ✅ code | 🧪 | `PUT /v1/me/interests`; fallback categories if API fails |
| Guest session | ✅ API | PASS | `POST /v1/guest/sessions` → `token` |
| Persistence | ✅ code | 🧪 | AsyncStorage `playbyte_guest_token` |
| Duplicate submit | ✅ code | — | Interests / respond use loading guards |

---

## Main navigation

| Destination | Status | Notes |
|-------------|--------|-------|
| Feed | ✅ | Tab |
| Compete (Live Now) | ✅ | Tab → sorted moments from feed |
| Friends | ✅ | Tab; sign-in gated |
| Vault (= Settings) | ✅ | Tab; no separate Profile screen |
| Notifications | ✅ overlay | Prefs only |
| Weekly Recap | ✅ overlay | |
| Sign In | ✅ overlay | Hidden CTAs if Supabase env missing |
| Leaderboard | 🟡 overlay | Friends list; geo scopes “Coming soon” |
| Games / Post-game | ✅ | Imperative overlay in `MainShell` |
| Deep links | 🟡 | Scheme `playbyte`; limited handling |

Custom shell (`MainShell.tsx`) — not React Navigation (packages present but unused).

---

## Feed & moments

| Check | Status | Evidence |
|-------|--------|----------|
| Load from backend | ✅ | Smoke: 20 items (14 moments + 6 mini_games) |
| Loading / error / retry | ✅ code | `AppContext` + `ErrorState` |
| Empty feed | ✅ code | EmptyState |
| Respond + idempotency | ✅ API | Smoke PASS |
| Crowd result (real %) | ✅ API | Snapshot from DB |
| Fabricated crowd % | ✅ none | |
| Pagination | 🚧 | Single page `limit≈20`; cursor field present, unused |
| Share card | 🔴 live | Smoke FAIL 500 |
| Network / session expiry | 🟡 code | 401 handler re-guest / refresh |

---

## Games

**Production enabled (API):** `higher_or_lower`, `memory_sequence`, `traffic_light`, `timer_stop`, `color_match`, `frenzy_tap`, `odd_one_out`, `perfect_circle`.

**Client engines also present (not enabled on live seed):** `bubble_burst`, `lane_dash`, `triple_match`, `flag_rush`, `emoji_decode`, `word_scramble`, `word_blitz`, `grid_hunt`.

| Check | Status |
|-------|--------|
| Launch from feed intro | ✅ code |
| Unknown key fallback | ✅ registry |
| Score submit + clamp/percentile | ✅ API + unit tests |
| Post-game score truthful | ✅ fixed (removed fake XP/session rank) |
| Post-game Challenge CTA | ✅ fixed (removed misleading Sign-In shortcut) |
| Device gameplay of all 8 | 🧪 not run this pass |
| Client-authoritative scores | 🚧 accepted MVP risk |

---

## Friends / Compete / Social

| Feature | Status | Notes |
|---------|--------|-------|
| List / requests / accept / send | ✅ API + UI | UUID add flow |
| Fabricated leaderboard scores | ✅ fixed | Removed from `FriendsScreen` |
| Friend remove / block | ⚪ | Deferred |
| Live Now | 🟡 | Feed-derived |
| Public / city ranks | 🚧 | UI says Coming soon |

---

## Vault / Settings / Notifications

| Feature | Status |
|---------|--------|
| Profile / privacy / prefs | ✅ |
| Data export / deletion request | ✅ API; delivery UX incomplete |
| Logout → guest | ✅ code |
| Push token register | 🟡 endpoint only |
| Push delivery | ⚪ |
| Help / guidelines | 🚧 “Coming soon” |

---

## Backend endpoints (smoke this pass)

| Method | Route | Auth | Result |
|--------|-------|------|--------|
| GET | `/health` | Public | PASS |
| GET | `/ready` | Public | PASS |
| POST | `/v1/guest/sessions` | Public | PASS |
| GET | `/v1/feed` | GuestOrUser | PASS |
| GET | `/v1/categories` | Public | PASS (17) |
| GET | `/v1/games` | GuestOrUser | PASS (8) |
| POST | `/v1/moments/{id}/responses` | GuestOrUser | PASS |
| GET | `/v1/moments/{id}/result` | GuestOrUser | PASS |
| POST | `/v1/moments/{id}/share-card` | GuestOrUser | **FAIL 500** |
| POST | `/v1/games/{key}/plays` | GuestOrUser | PASS |
| GET | `/v1/feed` no/bad token | — | PASS 401 |

Other me/friends/admin endpoints: code-reviewed; not live-smoked this pass.

---

## Supabase / storage

| Item | Status |
|------|--------|
| Migrations 0001–0004 | Present in repo |
| Table RLS | Intentionally **off** (API-only) |
| Storage buckets SQL | `0002_storage.sql` |
| Live `share-cards` upload | **Broken** (500) — apply migration + service role; redeploy API for 503 clarity |
| Service role in mobile | ✅ not bundled |

---

## Security (summary)

| Finding | Severity | Prod blocker? |
|---------|----------|---------------|
| PostgREST exposed without table RLS (if Data API open) | Critical | Yes — confirm Data API locked down |
| Share-card storage failure | High (feature) | Blocker for share journey only |
| In-memory rate limits | Medium | Acceptable single-instance |
| Admin `X-Admin-Key` non-prod only | Low if `APP_ENV=production` | Verify env |
| Client-authoritative game scores | Medium | Accepted MVP |
| No critical secrets in mobile bundle | Pass | — |

---

## Stitch / UX

Functional truthfulness prioritized over pixel polish. Known gaps: Welcome image placeholder; language not editable in Vault; XP chrome removed from post-game to match real percentile data.

See `docs/design/stitch/SCREEN_MAP.md` for design mapping.
