# Tester notes — Maja preview

**Audience:** external testers on an EAS **preview** Android build (APK)  
**API:** `https://majaa-production.up.railway.app` (baked into the `eas.json` preview profile)  
**Build:** this build adds native modules (audio, photo picker), so older APKs must be replaced, not updated over the air.

## What to test

1. **Onboarding:** Language → intro slides → Welcome (guest, email or Google) → profile → interests → ready → feed.
2. **Feed:** swipe through moments and games. The feed never runs out; after a full pass it reshuffles. Answer moments, see the crowd result, like, comment, share.
3. **Mini-games:** open from the feed, play to the end, see score and percentile. Try **Play again**, **Next game** and **Back to feed**. Music changes per game; timers tick in the last 5 seconds.
4. **Compete:** live moments sorted by activity; tapping one jumps into the feed.
5. **Friends** (sign-in required): share your player ID, add a friend by ID, accept or decline requests, remove a friend.
6. **Leaderboard** (Friends tab → leaderboard): **Friends** and **Global** boards, **This week** and **All time**. Every answered moment and finished game is worth 10 points. Guests can see Global; private profiles are hidden from Global.
7. **Profile photo:** Vault → Profile → **Add a photo** (or tap the badge during onboarding when signed in). Pick and crop a photo; it shows in the top bar, on boards and on comments. **Remove photo** clears it.
8. **Vault / Settings:** display name and bio, privacy visibility, notification preferences, sound (music / sound effects), language, weekly recap, sign out.
9. **Your data:** **Export my data** then **Download my export** (opens a JSON file); **Delete my data** asks for confirmation, then signs you out and deletes the account, including the sign-in login.
10. **Support:** **Report a problem** opens an email with the app version and your player ID filled in.

### Auth checklist (Android)

- [ ] Email sign-up with an invalid email or short password shows a clear error
- [ ] Email sign-up with confirmation on shows "check your email" and doesn't pretend you're signed in
- [ ] Email sign-in works; guest answers and plays carry over
- [ ] Google sign-in works; cancelling doesn't show an error
- [ ] Sign out returns to guest; Friends clears until you sign in again

## Known limitations (don't file as bugs)

| Item | Behaviour |
|------|-----------|
| Push notifications | Preferences save to your account; alerts aren't sent yet |
| Language picker | Saved, but app text stays English |
| Challenge a friend head-to-head | Not in this build |
| Blocking players | Not in this build; use **Report** on comments |
| Privacy policy links in Settings | Shown only when the build sets `EXPO_PUBLIC_LEGAL_BASE_URL` |
| Crowd numbers and likes on polls | Seeded with starting values so new polls don't look empty |
| iOS | Not a target for this release |

Setup: [`docs/runbooks/google-auth-setup.md`](runbooks/google-auth-setup.md)

## How to build preview

```bash
cd apps/mobile
pnpm eas build --profile preview --platform android
```

## Report bugs with

- Device and Android version
- Guest, email or Google account
- Steps and a screenshot
- Approximate time (for server logs)
- The app version from the bottom of Vault
