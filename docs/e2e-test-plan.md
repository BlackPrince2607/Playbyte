# E2E Test Plan — Playbyte

**Environment under test:** Railway API `https://playbyte-production.up.railway.app` + Expo preview profile (`eas.json`).  
**Date:** 2026-09-21  
**Automation entrypoint:** `python scripts/smoke_api.py [base_url]`

## Test environment

| Layer | Value |
|-------|--------|
| API | Railway production-named service (used by preview builds) |
| DB | Supabase project behind Railway `DATABASE_URL` |
| Mobile | EAS preview APK/IPA (build **not** re-run this pass) |
| Auth | Guest tokens; email/password via Supabase when configured |

## Fixtures / accounts

| Fixture | How |
|---------|-----|
| Guest | `POST /v1/guest/sessions` |
| Signed-in user | Create via Sign In screen (email/password) in preview build |
| Admin | Bootstrap `admin_users` — CMS not covered here |

Do **not** fabricate crowd or leaderboard data in production.

---

## Journey matrix

| Journey | Automated | Manual / device | Status this pass |
|---------|-----------|-----------------|------------------|
| A — New guest (onboard → feed → respond → game → vault) | Partial (API) | Required | API core PASS; UI 🧪 |
| B — Returning user | — | Required | Code path exists |
| C — Auth (sign-in/out/convert) | — | Required | Depends on Supabase |
| D — Sharing | Smoke | Required | **FAIL** share-card 500 |
| E — Error recovery | Partial (401) | Required | Offline not automated |

---

## Automated cases

### API smoke (`scripts/smoke_api.py`)

| Case | Expected | Actual (2026-09-21) |
|------|----------|---------------------|
| Health / ready | 200 ok | PASS |
| Guest session | token | PASS |
| Feed items > 0 | 200 | PASS (20) |
| Categories > 0 | 200 | PASS |
| Games > 0 | 200 | PASS (8) |
| Respond moment | 200 | PASS |
| Result snapshot | 200 | PASS |
| Share-card | 200 + assetUrl | **FAIL 500** |
| Game play | 200 + percentile | PASS |
| Feed unauth / bad token | 401 | PASS |

### Backend unit / domain (`cd backend && uv run pytest`)

| Suite | Result |
|-------|--------|
| health, security, production_config, domain, feed, friends, cms, privacy, storage, notification_prefs, **sharing** | **33 passed** |

---

## Manual device cases (tester checklist)

### Journey A — New guest

1. Fresh install / clear storage → Welcome → Get Started → Language → Interests → Feed.  
2. Answer a moment → crowd % appears → not static.  
3. Open mini-game intro → play → finish → score + percentile match run.  
4. Return to feed; open Vault; kill app; relaunch → still in app (guest token).  

**Expected:** No false “signed in”; share may error until storage fixed.

### Journey B — Returning

1. Warm launch restores session.  
2. Setting change (privacy/prefs) persists after restart.

### Journey C — Auth

1. Sign up / sign in with valid email.  
2. Invalid credentials show error.  
3. Sign out returns guest; friends cleared.  
4. Convert-guest after engagements.

### Journey D — Sharing

1. After respond, Share → expect image URL / system share sheet.  
2. On failure, honest error (no success toast).  
**Blocked** until share-cards storage fixed + API redeployed.

### Journey E — Errors

1. Airplane mode launch.  
2. Invalid deep link.  
3. Rapid double-tap respond / play (idempotency).  

---

## Per-game manual matrix (8 live)

For each: launch, play normal, early exit, restart, complete, verify post-game score.

| Game | Device test |
|------|-------------|
| higher_or_lower | 🧪 |
| memory_sequence | 🧪 |
| traffic_light | 🧪 |
| timer_stop | 🧪 |
| color_match | 🧪 |
| frenzy_tap | 🧪 |
| odd_one_out | 🧪 |
| perfect_circle | 🧪 |

Additional client engines (flag_rush, etc.) appear only if enabled in DB.

---

## Blockers for full E2E

1. **Share-card 500** on live API (storage bucket / service role / undeployed error mapping).  
2. **No mobile automated UI tests** (Jest/Detox not configured).  
3. **EAS preview rebuild** not executed this pass — confirm APK against current API after fixes.  
4. Device gameplay of all eight games not executed in CI.
