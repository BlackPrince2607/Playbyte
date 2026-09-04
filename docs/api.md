# API (v1)

Base URL: `/v1`  
Auth: `Authorization: Bearer gst_...` (guest) or Supabase JWT.  
Admin: `X-Admin-Key` or admin user JWT.  
Errors: `{ "code", "message", "requestId" }`

| Method | Path | Auth | Notes |
| ------ | ---- | ---- | ----- |
| POST | /guest/sessions | none | Create guest |
| GET | /feed | guest/user | Hybrid feed |
| GET | /categories | none | Interest chips |
| GET | /moments/:id | guest/user | |
| GET | /moments/:id/result | guest/user | Poll fallback |
| POST | /moments/:id/responses | guest/user | `Idempotency-Key` |
| POST | /moments/:id/share-card | guest/user | After respond |
| GET | /games | guest/user | |
| POST | /games/:key/plays | guest/user | `Idempotency-Key` |
| GET | /me | user | |
| PATCH | /me/profile | user | |
| PUT | /me/interests | guest/user | |
| GET | /me/recap/weekly | user | |
| POST | /friends/requests | user | |
| POST | /reports | guest/user | |
| POST | /me/data-requests | user | export/deletion |
| POST | /me/convert-guest | user | Preserve history |
| * | /admin/* | admin | CMS |
