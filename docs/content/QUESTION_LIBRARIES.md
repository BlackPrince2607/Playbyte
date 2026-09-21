# Question libraries → Playbyte categories

Live API categories today: **sports, cricket, news, pop-culture, food, weather, tech, music, movies, social, casual**.

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

## What libraries do *not* cover well

PLAY is participation-first (**predict / pulse / reaction**), India-vernacular. Open trivia banks are mostly Western fact quizzes — weak for:

- `cricket` (IPL / match-night predicts)
- `news` / `weather` (time-sensitive)
- `social` / `casual` (opinion polls)
- Food culture (chai, Maggi, street food)

For those, use **editorial polls** (CMS or the pack below), not OpenTDB.

## Recommended workflow

1. **Quizzes** — pull from OpenTDB / open-quiz-bank → edit wording → tag `quiz` → CMS draft → live  
2. **Polls / predicts** — use `docs/content/category-question-pack.json` (or content_gen) → CMS  
3. Never auto-publish library questions without a human pass (wrong answers, tone, restricted topics)

## Related in-repo

- Generator: `backend/scripts/content_gen/` (templates; drafts only)  
- Seed samples: `supabase/seed/002_sample_moments.sql`  
- Starter pack: `docs/content/category-question-pack.json`  
- **Seed via admin API (hosted):**  
  `python scripts/seed_question_pack.py --go-live`  
  (uses `X-Admin-Key`; Railway currently accepts string options only — quiz correct-answers need migration `0003` + API redeploy)
