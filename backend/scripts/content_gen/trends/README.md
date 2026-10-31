# Manual India trends (ops)

Fill these JSON files before a feed refresh so the English content agent can ground cards in **verified** India-relevant topics.

## Rules

- Never invent a trend in the model. If a topic is not listed here (or in `briefs/`), do not claim it is trending.
- One file per onboarding category: `{slug}.json`.
- Drop or expire stale rows with `expiresAt` (ISO timestamp). Expired rows are ignored automatically.
- Prefer high `indiaRelevance` (0–100) and concrete `facts` the quiz/poll can safely use.
- `allowedAngles` controls what the agent may invent from that trend: `trivia`, `who`, `which`, `opinion`, `debate`, `hot`, `prediction`, etc.
- Use `prediction` only for genuinely upcoming events.

## Schema

```json
{
  "category": "cricket",
  "updatedAt": "2026-10-31T00:00:00Z",
  "trends": [
    {
      "trendId": "unique-id",
      "topic": "Short topic name",
      "trendScore": 90,
      "freshness": "live",
      "indiaRelevance": 100,
      "eventStatus": "upcoming",
      "facts": ["Verified factual statement only"],
      "allowedAngles": ["trivia", "which", "debate"],
      "sourceConfidence": "high",
      "expiresAt": "2026-11-05T00:00:00Z"
    }
  ]
}
```

## Workflow

1. Update the relevant `{category}.json` files.
2. Set `updatedAt` to now.
3. Run the refresh job (`scripts/refresh_feed_content.py`).

Empty `trends: []` means: generate high-quality recognizable trivia + sharp debates for that category without viral/trending framing.
