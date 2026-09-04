# Realtime

Crowd updates use compact versioned snapshots, never raw response rows.

Channel: `moment:{momentId}`  
Event: `crowd.snapshot`

```json
{
  "event": "crowd.snapshot",
  "momentId": "uuid",
  "version": 1827,
  "generatedAt": "2026-08-12T09:00:00Z",
  "totalResponses": 48231,
  "optionCounts": { "yes": 30215, "no": 18016 },
  "joinedLastMinute": 423,
  "volumeState": "mature"
}
```

`volumeState`: `nascent` | `building` | `mature` from real counts only.

If Broadcast is unavailable, the client polls `GET /v1/moments/:id/result` and keeps the last good snapshot.
