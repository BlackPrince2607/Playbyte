# Tester notes — Playbyte preview

**Audience:** external testers on an EAS **preview** Android build  
**API:** `https://playbyte-production.up.railway.app` (baked into `eas.json` preview profile)  
**Last API smoke (2026-09-21):** core guest/feed/respond/games/share-card — **PASS** (12/12 after storage fix).

## What to test

1. **Onboarding** — Welcome → Get Started → Language → Interests → feed  
2. **Feed** — swipe moments, answer, see crowd %, share card  
3. **Mini-games** — open from feed, finish, see **score + percentile** (no XP/global ranks)  
4. **Compete** — live moments list; tap jumps into feed  
5. **Friends** — sign in required; add by user UUID; accept requests; list shows friends **without fake scores**  
6. **Vault** — profile, privacy, notifications prefs, weekly recap, sign out  
7. **Email auth** — Welcome / Vault / save-progress banner → sign in / sign up; guest history should convert  
8. **Google auth (Android)** — Welcome or Sign-in → Continue with Google (requires Google provider + Web client ID in the build; see runbook)

### Auth verification checklist (Android)

- [ ] Email sign-up with invalid email / short password shows clear errors  
- [ ] Email sign-up with confirmation enabled shows “check your email” and does **not** pretend you are signed in  
- [ ] Email sign-in works; guest responses/plays remain after convert  
- [ ] Google Sign-In works when configured; cancel does not show a scary error  
- [ ] Sign out returns to guest; Friends clears until sign-in again  

## Known stubs (do not file as bugs)

| Item | Behavior |
|------|----------|
| Google button missing | Build missing `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` or Supabase not configured — ops, not app bug |
| `Provider … is not enabled` on Google | Supabase Google provider still off — enable in dashboard (see runbook); no rebuild needed |
| Push notifications | Prefs save; delivery not implemented |
| Challenge on moments | Uses share-card flow (same as Share) |
| Post-game Challenge | Removed until game share exists |
| Public / city leaderboards | Friends list only; other scopes say coming soon |
| XP / global ranks | Not productized; post-game shows score + percentile only |
| Language picker | Saved locally; UI strings stay English |
| Feed pagination | Single page (~20 items); no infinite scroll yet |
| Friend remove / block | Not in app |
| iOS | Not a target for Google Sign-In in this release |

Setup: [`docs/runbooks/google-auth-setup.md`](runbooks/google-auth-setup.md)

## How to build preview

```bash
cd apps/mobile
# Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in eas.json preview env (or eas env) first
pnpm eas build --profile preview --platform android
```

Requires Expo account login and EAS project `d4604f3d-6fb5-4a81-acf6-5843ceea2fb5`.

## Report bugs with

- Device / OS (Android version)  
- Guest vs signed-in vs Google  
- Steps + screenshot  
- Approximate time (for server logs)  
- Whether share-card or Google Sign-In was involved
