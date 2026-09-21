# Daily content generation

Generate ~50 high-CTR draft quizzes/polls for editorial review.

```bash
cd backend
# Dry-run (JSON report only)
python -m scripts.content_gen.run --count 50 --tags poll,quiz --dry-run

# Insert drafts into DB (requires migration 0003 + DATABASE_URL)
python -m scripts.content_gen.run --count 50 --tags poll,quiz --out reports/daily.json
```

Optional: set `OPENAI_API_KEY` to polish the first few prompts via OpenAI.

Drafts are never auto-published — use the admin CMS to mark ready / go live.
