# Category polls and quizzes

Every onboarding category has a poll catalog and a matching quiz catalog. Personality & Vibe and K-Pop are included. Sports, cricket, and movies also read verified event briefs.

The OpenAI agent **fills** a fresh batch for every category on each refresh (~20 cards by default). It reads engagement insights (what got answers, likes, comments, shares) and biases the next prompts toward India trends that performed. Cards expire in ~4 hours. After the new batch is live, the job retires **all** previous live moments so nothing repeats. Freeform opinion/hot polls and trend trivia (`trivia` / `who` / `which`) are allowed; evergreen bank quizzes remain a fallback. Each card also gets everyday spoken Hindi (`promptHi` / `labelHi`); evergreen and meme cards go through a `localize_hi` pass. `OPENAI_API_KEY` is required. Set it in `.env` locally and as a GitHub secret for the refresh job. Do not commit the key. `OPENAI_MODEL` defaults to `gpt-4o-mini`. A key that starts with `sk-or-` is sent to OpenRouter, and a model name without a slash becomes `openai/gpt-4o-mini`. Set `OPENAI_BASE_URL` to override the host.

Game content packs: `python -m scripts.localize_content_hi` upserts `hi-IN` items (id suffix `.hi`) from the English pack JSON.

```bash
cd backend
python -m scripts.content_gen.run --category kpop --count 20 --out reports/kpop.json
```

That writes a report. It does not insert rows.

Publishing is `scripts/refresh_feed_content.py` (GitHub Actions every 4 hours). Each run loads `GET /v1/admin/moments/insights`, publishes a large agent batch (plus optional meme spice), then retires the previous live feed. Saving interests (`PUT /v1/me/interests`) fills a selected category from the catalog until it has 8 live cards so a brand-new pick is not empty; those bridge cards also expire. The feed request does not call OpenAI.
