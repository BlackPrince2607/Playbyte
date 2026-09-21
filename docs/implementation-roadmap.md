# Implementation Roadmap — Playbyte

**Based on:** 2026-09-21 audit + live smoke. Effort: Small / Medium / Large / Complex.

## Recommended sequence

1. Fix share-card storage on Supabase + redeploy Railway (P0).  
2. Confirm Supabase Data API / PostgREST lockdown (P0 security).  
3. Ship preview build with truthful Friends / post-game UX (already in code).  
4. Device-test Journey A–E.  
5. Then P1 pagination, push, OAuth, friend remove.

---

## P0 — Production / tester blockers

| Task | Description | Files / ops | Dependencies | Acceptance | Effort |
|------|-------------|-------------|--------------|------------|--------|
| Share-card storage | Create `share-cards` bucket (run `0002_storage.sql`); set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` on Railway; redeploy API | Supabase dashboard, Railway env, `docs/runbooks/share-card-storage.md` | Supabase project | Smoke share-card returns 200 + `assetUrl` (or honest 503 if intentionally down) | Small (ops) |
| Redeploy sharing 503 mapping | Deploy backend with hardened `moment_share_card` | `backend/app/modules/sharing/service.py` | Railway deploy | Misconfig → `503 storage_unavailable`, not opaque 500 | Small |
| PostgREST / RLS posture | Confirm Data API disabled or grants revoked for `anon`/`authenticated` on `public` | Supabase project settings | Access to project | No table read/write via anon key | Small–Medium |
| Truthful social/result UI | Remove fabricated friend scores & fake XP (done in mobile) | `FriendsScreen.tsx`, `PostGameResultScreen.tsx`, `MainShell.tsx` | Preview rebuild | No fabricated numbers in Friends / post-game | Small (done) |

---

## P1 — Tester readiness

| Task | Description | Files | Dependencies | Acceptance | Effort |
|------|-------------|-------|--------------|------------|--------|
| Device E2E Journey A–E | Manual on preview APK | — | Preview build | Checklist signed in `e2e-test-plan.md` | Medium |
| Feed error/empty polish | Confirm offline + retry copy | `AppContext`, FeedScreen | — | Recoverable UX | Small |
| Moment Challenge label | Challenge currently aliases Share — label or separate | `ActionRail`, `MomentFeedPage` | — | No misleading “Challenge” if only share | Small |
| Enable remaining games (optional) | Seed/enable engines 9–16 if desired for testers | `supabase/seed`, admin PATCH games | Content QA | Games list matches product intent | Medium |
| Admin smoke | CMS go-live + moment publish | `apps/admin` | Admin user | Can publish live moment | Medium |
| Mobile typecheck in CI | Already in CI historically; keep green | `apps/mobile` | — | `tsc --noEmit` PASS | Small |

---

## P2 — Production completeness

| Task | Description | Files | Dependencies | Acceptance | Effort |
|------|-------------|-------|--------------|------------|--------|
| Feed cursor pagination | Wire `cursor` from API through client | feed service, AppContext, FeedScreen | API contract | Infinite scroll / load more | Large |
| Push notifications | APNs/FCM + worker dispatch | notifications module, mobile | Certificates | Real push on engage | Complex |
| Google OAuth | Welcome CTA | AuthContext, Supabase providers | OAuth console | Sign-in works | Large |
| Friend remove / block | API + UI | friends module, FriendsScreen | Product rules | Remove reflected in list | Medium |
| Friend competitive scores | Real aggregates if product wants ranks | new API | Game plays privacy | Scores from DB only | Large |
| Game share-card / challenge | Post-game share without fake Sign-In | sharing + MainShell | Storage | Share works for plays | Medium |
| Full i18n | Language affects strings | mobile i18n | Content | Language setting works | Large |
| Sentry wiring | Use `SENTRY_DSN` | main.py, mobile | Sentry project | Errors visible | Medium |
| Integration tests + Postgres | Testcontainers or staging suite | backend/tests | CI runners | Respond/share/auth covered live | Large |

---

## P3 — Post-launch

| Task | Description | Effort |
|------|-------------|--------|
| Pixel-perfect Stitch QA | SCREEN_MAP diffs | Medium |
| Advanced animations | Feed / game polish | Medium |
| Public / geo leaderboards | Product deferred | Complex |
| Redis rate limiting | Multi-instance | Medium |
| Table RLS defense-in-depth | Even with API-only | Large |
| Mobile unit tests (Jest) | Engine pure logic | Medium |
| Detox/Maestro E2E | Device automation | Complex |

---

## Intentionally deferred (document, do not fake)

- Public leaderboards  
- Push delivery  
- Google Sign-In  
- Friend remove  
- Feed pagination  
- Billing  
- XP / global ranks as product systems
