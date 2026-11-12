# Category polls and quizzes

Every onboarding category has a poll catalog and a matching quiz catalog. Merged picks: K-Pop & K-Drama, Technology (+ science), Personality & Quizzes (+ social), Bollywood (movies only). Sports, cricket, and Bollywood also read verified event briefs. `sports` is Sports (Non-Cricket): the agent prompt and publish gate reject cricket/IPL copy there so it stays in the `cricket` category.

## Two language agents (two card pools)

MAJA content generation uses **two separate generation agents** and **two moment pools**. They do not share questions.

1. **English Content Agent** (`agent.py` → `EN_SYSTEM` / `agent_candidates`): Invents English-only cards (`prompt`, `options[].label`). Published with `contentLang=en`. Never writes Hindi, Hinglish, Devanagari, or `promptHi` / `labelHi`.
2. **Hindi Content Agent** (`hi_generate_prompt.py` → `HI_GENERATE_SYSTEM` / `agent_candidates_hi`): Invents **original** Devanagari Hindi/Hinglish cards into the same primary fields (`prompt`, `options[].label`). Published with `contentLang=hi`. Never translates or mirrors English sibling cards.

The app language switch (`lang=en|hi` on `/v1/feed`) filters by `content_lang`. Votes, correctness, and analytics are per moment ID — English and Hindi pools do not share IDs.

Legacy bilingual rows (`content_lang=en` + `prompt_hi`) may still appear for Hindi until the next refresh retires them. New publishes do **not** localize English into Hindi.

Pipeline: verified trends/briefs → English agent **and** Hindi agent (parallel pools) → per-lang purity gates → fact/category gates → dedupe/diversity → EN evergreen top-up only → publish.

`localize_hi` / `HI_LOCALIZE_SYSTEM` remain in the repo for older tests only — they are **not** used on the refresh or stock paths.

## Manual India trends (ops)

Before each refresh, ops can fill [`trends/{category}.json`](trends/) with verified India-relevant topics for that category. See [`trends/README.md`](trends/README.md).

- Active (non-expired) rows are merged with event briefs into `verifiedTrends` for both agents.
- The model must **not** invent trending/viral claims without a matching verified trend or brief.
- Empty `trends: []` is fine: agents still generate recognizable trivia + sharp debates without fake viral framing.
- Soft mix target: ~60% trivia/who/which quizzes, ~30% debate/hot/opinion polls, predictions only when upcoming + verified.

The OpenAI agents **fill** a fresh batch for every category on each refresh (~20 EN + ~20 HI cards by default). They read engagement insights (what got answers, likes, comments, shares) and bias toward patterns that performed — not cloned wording. After the new batch is live, the job retires **all** previous live moments so nothing repeats. `OPENAI_API_KEY` is required. Set it in `.env` locally and as a GitHub secret for the refresh job. Do not commit the key. `OPENAI_MODEL` defaults to `gpt-4o-mini`. A key that starts with `sk-or-` is sent to OpenRouter, and a model name without a slash becomes `openai/gpt-4o-mini`. Set `OPENAI_BASE_URL` to override the host. Both agents may share the same key/model; separation is about responsibility and card pools, not infrastructure.

Game content packs: `python -m scripts.localize_content_hi` upserts `hi-IN` items (id suffix `.hi`) from the English pack JSON — that path is separate from feed moments.

```bash
cd backend
python -m scripts.content_gen.run --category kpop --count 20 --out reports/kpop.json
```

That writes a report. It does not insert rows.

Publishing is `scripts/refresh_feed_content.py` (GitHub Actions every 4 hours). Each run loads `GET /v1/admin/moments/insights`, publishes separate English and Hindi agent batches (plus optional EN meme spice), then retires the previous live feed. Saving interests (`PUT /v1/me/interests`) fills a selected category from the **English** catalog until it has 8 live `content_lang=en` cards; Hindi relies on the refresh agents (no Hindi evergreen bank yet). The feed request does not call OpenAI.
