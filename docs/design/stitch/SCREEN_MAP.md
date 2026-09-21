# Stitch → Playbyte mobile screen map

**Project:** PLAY Social Play Platform (`projects/14973883405125719991`)  
**Source:** Stitch MCP + exports in `html/` and `screenshots/`  
**Nav (Stitch-exact):** Feed · Compete · Friends · Vault

| Stitch screen | RN route / component | API / behavior | Fidelity notes |
|---------------|---------------------|----------------|----------------|
| Welcome to PLAY - Refined | `WelcomeScreen` | First launch | Floating cards + CTAs |
| PLAY - Get Started (Refined) | `GetStartedScreen` | → language / games | Live Now carousel + invite CTA |
| Choose Your Language - PLAY | `LanguageScreen` | Locale persist | Language grid |
| Choose Your Interests - PLAY | `InterestsScreen` | `PUT /v1/me/interests` | 2-col cards |
| PLAY - Refined Game Feed Layout | `FeedScreen` + `MomentFeedPage` | `GET /v1/feed` | Card shell + action rail |
| PLAY - Social Poll Results | `MomentFeedPage` answered | respond + result poll | FriendChoiceStrip + % bars |
| PLAY - Refined Trivia Quiz Feed | `MomentFeedPage` quiz | same | Quiz tags / correct states |
| PLAY - Speed Puzzle Feed | `GameIntroPage` + `GameEngine` | `/v1/games/:key/plays` | Shell chrome; 8 local games |
| PLAY - Post-Game Result | `PostGameResultScreen` | submitPlay percentile | XP/session tiles remapped (no public XP API) |
| PLAY - Live Now (Refined) | `LiveNowScreen` (Compete) | feed moments | MajorityChip + compact avatars |
| PLAY - Friends & Leaderboard | `FriendsScreen` | friends APIs | Live strip + invite + embedded ranks |
| PLAY - Leaderboard | `LeaderboardScreen` | friends-scoped UI | No public geo ranks API |
| PLAY - Notifications | `NotificationsScreen` | notification-preferences | Prefs chrome (no inbox API) |
| PLAY - Settings | `SettingsScreen` (Vault) | me / privacy / prefs | Stitch section cards |

## Intentional deviations (API honesty)
- No likes/comments/XP economy / India geo ranks / notification inbox / per-question quiz timers.
- Challenge → share-card / native share.
- Leaderboard scores are friends-scoped display heuristics until a ranks endpoint exists.
