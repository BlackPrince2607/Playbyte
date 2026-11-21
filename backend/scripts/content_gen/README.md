# Category polls and quizzes

Content is organized as **category → format (subcategory) → types**.

- **Categories** (user interests): see `taxonomy.py` → `ONBOARDING_SLUGS` (Bollywood, Mythology, TV Serials, Cricket, …).
- **Formats**: `poll`, `trivia`, `this_or_that`, `find_the_difference`, `quiz` (per-category allow-list).
- **Types**: config lists under each format (e.g. Mythology poll → `ramayana`, `mahabharat`; Bollywood trivia → `movie_guess`, `song_guess`). Add types in `taxonomy.py` without an app release.

`sports` vs `cricket` is now `football` vs `cricket`. Legacy slugs (`movies`, `food`, …) remap via `normalize_slug`.

## Two language agents (two card pools)

1. **English Content Agent** (`agent.py` → `EN_SYSTEM` / `agent_candidates`): Invents English-only cards. Published with `contentLang=en`.
2. **Hindi Content Agent** (`hi_generate_prompt.py` → `HI_GENERATE_SYSTEM` / `agent_candidates_hi`): Invents original Devanagari cards. Published with `contentLang=hi`.

Pipeline: verified trends/briefs → EN + HI agents → purity/fact/dedupe gates → EN evergreen top-up → optional FTD image pack spice → publish.

Find-the-difference does **not** invent images in the LLM. Ops can fill `docs/content/ftd-image-pack.json`; refresh attaches those rows when the category allows `find_the_difference`.

## Manual India trends (ops)

Fill [`trends/{category}.json`](trends/) for active taxonomy slugs before refresh. Legacy slug files still merge into remapped categories.

```bash
cd backend
python -m scripts.content_gen.run --category bollywood --count 20 --out reports/bollywood.json
```

Publishing is `scripts/refresh_feed_content.py` (GitHub Actions every 4 hours).
