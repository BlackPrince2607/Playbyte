# Category polls and quizzes

Every onboarding category has a poll catalog and a matching quiz catalog. Merged picks: K-Pop & K-Drama, Technology (+ science), Personality & Quizzes (+ social), Bollywood (movies only). Sports, cricket, and Bollywood also read verified event briefs. `sports` is Sports (Non-Cricket): the agent prompt and publish gate reject cricket/IPL copy there so it stays in the `cricket` category.

## Two language stages (one card)

MAJA content generation uses two language stages.

1. **English Content Agent** (`agent.py` → `_messages` / `EN_SYSTEM`): Generates and validates all game content in English only (`prompt`, `options[].label`). It must never generate final Hindi fields (`promptHi` / `labelHi`).
2. **Hindi Localization Agent** (`hi_localize_prompt.py` → `HI_LOCALIZE_SYSTEM` / `localize_hi`): Generates `promptHi` and `labelHi` after English content is finalized. It must never change game mechanics (`format`, `category`, `questionType`, `type`, `briefId`, option count/order, `isCorrect`).

Both language layers belong to the same underlying card. The app language switch selects display fields; votes, correctness, and analytics stay on one card ID.

Pipeline: verified trends/briefs → English agent → English validation → fact/category gates → dedupe/diversity → evergreen top-up → Hindi localization → final validation → publish.

## Manual India trends (ops)

Before each refresh, ops can fill [`trends/{category}.json`](trends/) with verified India-relevant topics for that category. See [`trends/README.md`](trends/README.md).

- Active (non-expired) rows are merged with event briefs into `verifiedTrends` for the English agent.
- The model must **not** invent trending/viral claims without a matching verified trend or brief.
- Empty `trends: []` is fine: the agent still generates recognizable trivia + sharp debates without fake viral framing.
- Soft mix target: ~60% trivia/who/which quizzes, ~30% debate/hot/opinion polls, predictions only when upcoming + verified.

The OpenAI agent **fills** a fresh batch for every category on each refresh (~20 cards by default). It reads engagement insights (what got answers, likes, comments, shares) and biases toward patterns that performed — not cloned wording. Cards expire in ~4 hours. After the new batch is live, the job retires **all** previous live moments so nothing repeats. Freeform opinion/hot polls and trend trivia (`trivia` / `who` / `which`) are allowed; evergreen bank quizzes remain a fallback. `OPENAI_API_KEY` is required. Set it in `.env` locally and as a GitHub secret for the refresh job. Do not commit the key. `OPENAI_MODEL` defaults to `gpt-4o-mini`. A key that starts with `sk-or-` is sent to OpenRouter, and a model name without a slash becomes `openai/gpt-4o-mini`. Set `OPENAI_BASE_URL` to override the host. Both agents may share the same key/model; separation is about responsibility, not infrastructure.

Game content packs: `python -m scripts.localize_content_hi` upserts `hi-IN` items (id suffix `.hi`) from the English pack JSON.

```bash
cd backend
python -m scripts.content_gen.run --category kpop --count 20 --out reports/kpop.json
```

That writes a report. It does not insert rows.

Publishing is `scripts/refresh_feed_content.py` (GitHub Actions every 4 hours). Each run loads `GET /v1/admin/moments/insights`, publishes a large agent batch (plus optional meme spice), then retires the previous live feed. Saving interests (`PUT /v1/me/interests`) fills a selected category from the catalog until it has 8 live cards so a brand-new pick is not empty; those bridge cards also expire. The feed request does not call OpenAI.
