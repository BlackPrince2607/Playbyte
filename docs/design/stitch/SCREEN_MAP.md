# Stitch → Playbyte mobile screen map

**Project:** PLAY Social Play Platform (`projects/14973883405125719991`)  
**Source:** `screens.json` + exported HTML in `html/`

| Stitch screen | RN route / component | API / behavior |
|---------------|---------------------|----------------|
| Welcome to PLAY - Refined | `WelcomeScreen` | First launch only |
| PLAY - Get Started (Refined) | `GetStartedScreen` | CTA → language or interests |
| Choose Your Language - PLAY | `LanguageScreen` | Persist locale preference |
| Choose Your Interests - PLAY | `InterestsScreen` | `PUT /v1/me/interests` |
| PLAY - Refined Game Feed Layout | `FeedScreen` + `FeedPager` | `GET /v1/feed`, vertical snap |
| PLAY - Social Poll Results | `MomentResultOverlay` | After `POST .../responses` |
| PLAY - Refined Trivia Quiz Feed | `MomentFeedCard` (pulse) | Same as predict |
| PLAY - Speed Puzzle Feed | `GameIntroCard` | Mini-game in feed |
| PLAY - Post-Game Result | `PostGameResultScreen` | After game play submit |
| PLAY - Live Now (Refined) | `LiveNowScreen` | Live moments from feed |
| PLAY - Friends & Leaderboard | `FriendsScreen` | `GET /v1/friends` (no public ranks) |
| PLAY - Notifications | `NotificationsScreen` | `PATCH /v1/me/notification-preferences` |
| PLAY - Settings | `SettingsScreen` | Profile, privacy, GDPR |
| PLAY - Leaderboard | Deferred / friends-only framing | Post-MVP per PRD |

**Refined variants** are used over older duplicates where both exist.
