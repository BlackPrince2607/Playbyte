# Category polls and quizzes

Content is organized as **category → format (subcategory) → types**.

- **Categories** (user interests): see `taxonomy.py` → `ONBOARDING_SLUGS` (Bollywood, Mythology, TV Serials, Cricket, …).
- **Formats**: topic interests use `poll`, `trivia`, `this_or_that`, `quiz`. `find_the_difference` is standalone under `memory-games` only (thematic photo packs).
- **Quiz-only skill categories** (`word-puzzles`, `math-puzzles`, `maths`): **actual puzzles only** (unscramble, riddles, sequences, calc) — no polls, no preference questions, no meta definitions like “a riddle is a…”. Feed badge is `quiz`, not `trivia`. Agent mix requests `polls: 0` for these.
- **Types**: config lists under each format (e.g. Mythology poll → `ramayana`, `mahabharat`; Bollywood trivia → `movie_guess`, `song_guess`). Spot themes → `objects`, `city`, `garden`, `space`. Add types in `taxonomy.py` without an app release.

`sports` vs `cricket` is now `football` vs `cricket`. Legacy slugs (`movies`, `food`, …) remap via `normalize_slug`.

## Two language agents (two card pools)

1. **English Content Agent** (`agent.py` → `EN_SYSTEM` from `poll_prompt.py` / `agent_candidates`): Invents English-only cards. Polls use the high-engagement New prompt playbook (23/30 quality bar, mix of versus / what-would-you-do / who-is-more-likely / …). Published with `contentLang=en`.
2. **Hindi Content Agent** (`hi_generate_prompt.py` → `HI_GENERATE_SYSTEM` / `agent_candidates_hi`): Invents original Devanagari cards. Published with `contentLang=hi`.

Pipeline: verified trends/briefs → EN + HI agents → purity/fact/dedupe gates → EN evergreen top-up → optional FTD image pack spice → publish.

## Mini-game packs (bundled EN + HI seeds)

Feed moments use the two invent agents above. Mini-game packs are **editorial seeds**, not agent invent:

- English: `apps/mobile/src/game/content/packs/*.json` (`locale` en-IN)
- Hindi-native: `apps/mobile/src/game/content/packs/hi/*.json` (`locale` hi-IN, ids `*.hi`) — original Devanagari copy, not a translate pass

Import both with `python -m scripts.import_content` (includes `packs/hi`). The client requests `?locale=hi-IN` in Hindi and uses the bundled HI pack offline; it does not show English pack copy when a HI pack exists.

Find-the-difference does **not** invent images in the LLM and is **not** tied to Bollywood/Mythology/etc. Ops can fill `docs/content/ftd-image-pack.json` with `categorySlug: memory-games` + a theme `contentType` (`objects` / `city` / `garden` / `space`); refresh attaches those rows only for `memory-games`.

## Manual India trends (ops)

Fill [`trends/{category}.json`](trends/) for active taxonomy slugs before refresh. Legacy slug files still merge into remapped categories.

```bash
cd backend
python -m scripts.content_gen.run --category bollywood --count 20 --out reports/bollywood.json
```

Publishing is `scripts/refresh_feed_content.py` (GitHub Actions every 4 hours).
