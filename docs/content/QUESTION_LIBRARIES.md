# Question libraries → Playbyte categories

Live API categories today: **sports, cricket, news, pop-culture, food, weather, tech, music, movies, social, casual**.

## Feed caps

There is **no hard DB cap** on total moments. Practical limits:

| Layer | Cap |
|-------|-----|
| Feed API page | `GET /v1/feed?limit=` default **10**, max **20** |
| Ranking pool | All `live` + unexpired moments are loaded, ranked, interleaved with games, then sliced to `limit` |
| Live set (ops) | Soft target **~40 live** via auto-refresh (retire previous live each run) |
| Option / prompt media | `moment-media` bucket: **5MB**, `png/jpeg/webp` |
| Options per card | predict/reaction = 2; pulse = 2–4 |

## Best external libraries (for quizzes)

| Source | License | Best for | Maps to Playbyte |
|--------|---------|----------|------------------|
| [Open Trivia DB](https://opentdb.com/api_config.php) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | Large free quiz API, no key | sports→21, movies→11, music→12, tech→18, food→food & drink (N/A — use General/Entertainment), pop-culture→weak |
| [node-open-quiz-bank](https://github.com/tamino-martinius/node-open-quiz-bank) | MIT + **CC0 data** | Offline JSON, seedable | sports, film→movies, food, music, technology→tech |
| [LearnClash open trivia](https://github.com/Pluxia-GmbH/learnclash-open-trivia) | CC BY 4.0 | Small curated set | Sports, Food & Drink, Pop Culture |
| [jgoralcz/trivia](https://github.com/jgoralcz/trivia) | check repo | Entertainment/Sports filters | movies, music, sports |

### OpenTDB category IDs (useful subset)

| OpenTDB | ID | Playbyte slug |
|---------|----|---------------|
| Sports | 21 | `sports` |
| Entertainment: Film | 11 | `movies` |
| Entertainment: Music | 12 | `music` |
| Science: Computers | 18 | `tech` |
| Entertainment: Television | 14 | `pop-culture` / `casual` |
| General Knowledge | 9 | `casual` / `social` |

Example fetch:

```text
https://opentdb.com/api.php?amount=10&category=21&type=multiple&encode=urlencode
```

**Rate limit:** ~1 request / 5s / IP. Always attribute if you redistribute (BY-SA).

## Image / meme choice polls

PLAY supports `promptImageKey` and per-option `imageKey` (hosted in Supabase `moment-media`). Mobile already renders option images.

| Source | Use | Notes |
|--------|-----|--------|
| [memegen.link](https://api.memegen.link/) | Generate classic meme frames with our captions | Download PNG → `POST /v1/admin/media` → store key |
| [Imgflip `/get_memes`](https://imgflip.com/api) | Discover popular **template names** for editorial copy | Do **not** scrape/redistribute UGC images wholesale |
| Openverse / Wikimedia **CC0/CC-BY** | Photo “this or that” options | Keep attribution for BY licenses |

In-repo meme pack: `docs/content/meme-image-pack.json` (memegen template refs resolved at refresh time).

**License rule:** host files we generate or that are clearly redistributable. Never hotlink third-party meme CDNs in production moments.

## What libraries do *not* cover well

PLAY is participation-first (**predict / pulse / reaction**), India-vernacular. Open trivia banks are mostly Western fact quizzes — weak for:

- `cricket` (IPL / match-night predicts)
- `news` / `weather` (time-sensitive)
- `social` / `casual` (opinion polls)
- Food culture (chai, Maggi, street food)

For those, use **editorial polls** (CMS or the packs below), not OpenTDB.

## Auto-refresh (every 4 hours)

Preview freshness is intentional: GitHub Actions retires live moments and floods a new batch (~40) with a ~5h `endsAt` window.

1. Workflow: [`.github/workflows/refresh-feed-content.yml`](../../.github/workflows/refresh-feed-content.yml)
2. Script: `python scripts/refresh_feed_content.py --count 40`
3. Required GitHub secrets:
   - `PLAYBYTE_API_URL` — e.g. `https://playbyte-production.up.railway.app`
   - `PLAYBYTE_ADMIN_KEY` — same key the API accepts via `X-Admin-Key` (non-prod) / admin path as deployed
4. Manual run: Actions → **Refresh feed content** → **Run workflow**
5. Local dry-run: `python scripts/refresh_feed_content.py --dry-run --no-images`

Admin media upload (needed for image moments):

```text
POST /v1/admin/media
{ "contentType": "image/png", "base64": "...", "key": "prompts/optional.png" }
```

## Recommended workflow

1. **Quizzes** — pull from OpenTDB / open-quiz-bank → edit wording → tag `quiz` → CMS draft → live  
2. **Polls / predicts** — use `docs/content/category-question-pack.json` (or content_gen)  
3. **Meme / image choices** — use `docs/content/meme-image-pack.json` via refresh (auto-publish) or CMS with uploaded keys  
4. Restricted topics still need dual approval — auto-refresh always sets `restrictedTopic=none`

## Related in-repo

- Generator: `backend/scripts/content_gen/` (aligned to live category slugs)  
- Seed samples: `supabase/seed/002_sample_moments.sql`  
- Text pack: `docs/content/category-question-pack.json`  
- Meme image pack: `docs/content/meme-image-pack.json`  
- Refresh: `scripts/refresh_feed_content.py`  
- One-shot seed (no retire): `python scripts/seed_question_pack.py --go-live`
