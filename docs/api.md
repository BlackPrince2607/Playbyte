# API (v1)

Base URL: `/v1`  
Auth: `Authorization: Bearer gst_...` (guest) or Supabase JWT.  
Admin: `X-Admin-Key` or admin user JWT.  
Errors: `{ "code", "message", "requestId" }`

| Method | Path | Auth | Notes |
| ------ | ---- | ---- | ----- |
| POST | /guest/sessions | none | Create guest |
| GET | /feed | guest/user | Hybrid feed; pass the returned `cursor` for the next page |
| GET | /categories | none | Interest chips |
| GET | /moments/:id | guest/user | |
| GET | /moments/:id/result | guest/user | Poll fallback |
| POST | /moments/:id/responses | guest/user | `Idempotency-Key` |
| POST | /moments/:id/share-card | guest/user | After respond |
| GET | /games | guest/user | |
| POST | /games/:key/plays | guest/user | `Idempotency-Key` |
| GET | /me | user | |
| PATCH | /me/profile | user | `avatarKey` only accepts your own uploaded key, or `""` to clear |
| POST | /me/avatar | user | Multipart `file`; PNG, JPEG or WebP up to 2 MB → `{ avatarKey, url }` |
| DELETE | /me/avatar | user | Removes the photo |
| PUT | /me/interests | guest/user | |
| GET | /me/recap/weekly | user | |
| POST | /friends/requests | user | |
| GET | /leaderboards/friends | user | `period=week\|all`; you plus accepted friends, 10 points per answer or finished game |
| GET | /leaderboards/global | guest/user | `period=week\|all`, `limit≤100`; private profiles hidden; `you` has your rank |
| POST | /reports | guest/user | |
| POST | /me/data-requests | user | export/deletion; deletion also removes the Supabase login |
| GET | /me/data-requests/:id | user | `downloadUrl` (1 hour) once an export is complete |
| POST | /me/convert-guest | user | Preserve history |
| * | /admin/* | admin | CMS |
