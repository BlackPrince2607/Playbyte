# Tester notes — Playbyte preview

**Audience:** external testers on an EAS **preview** build  
**API:** `https://playbyte-production.up.railway.app` (baked into `eas.json` preview profile)  
**Last API smoke (2026-09-21):** `/health`, `/ready`, guest, feed (20 items), categories, games (8), moment respond, result, game play, unauth 401 — **PASS**. Share-card — **FAIL 500** (storage; see `docs/runbooks/share-card-storage.md`).

## What to test

1. **Onboarding** — Welcome → Get Started → Language → Interests → feed  
2. **Feed** — swipe moments, answer, see crowd %, try share (expect possible error)  
3. **Mini-games** — open from feed, finish, see **score + percentile** (no XP/global ranks)  
4. **Compete** — live moments list; tap jumps into feed  
5. **Friends** — sign in required; add by user UUID; accept requests; list shows friends **without fake scores**  
6. **Vault** — profile, privacy, notifications prefs, weekly recap, sign out  
7. **Email auth** — Vault / save-progress banner → sign in / sign up; guest history should convert  

## Known stubs (do not file as bugs)

| Item | Behavior |
|------|----------|
| Share card | **Known broken** on current API until storage bucket + service role fixed — report if still failing after ops says fixed |
| Google on Welcome | Continues as guest; label says “soon” |
| Push notifications | Prefs save; delivery not implemented |
| Challenge on moments | Uses share-card flow (same as Share) |
| Post-game Challenge | Removed until game share exists |
| Public / city leaderboards | Friends list only; other scopes say coming soon |
| XP / global ranks | Not productized; post-game shows score + percentile only |
| Language picker | Saved locally; UI strings stay English |
| Feed pagination | Single page (~20 items); no infinite scroll yet |
| Friend remove / block | Not in app |
| Extra mini-games in client | Only **8** games enabled on server right now |

## How to build preview

```bash
cd apps/mobile
pnpm eas build --profile preview --platform android
# or ios
```

Requires Expo account login and EAS project `d4604f3d-6fb5-4a81-acf6-5843ceea2fb5`.

## Report bugs with

- Device / OS  
- Guest vs signed-in  
- Steps + screenshot  
- Approximate time (for server logs)  
- Whether share-card was involved
