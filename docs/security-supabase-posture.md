# Security notes — Supabase Data API / RLS (Playbyte)

**Date:** 2026-09-21  
**Status:** Open concerns documented; not marked complete.

## Intended posture

- Mobile and admin talk to **FastAPI** (`/v1/...`) with guest tokens or Supabase JWT.
- Supabase **service role** is server-only (Railway env). Never shipped to the mobile client.
- Storage writes for share-cards / exports go through the API with service role.
- Migration `0002_storage.sql` documents: Postgres app tables are **API-only** and historically created **without RLS**.

## Concerns to verify in the live Supabase project

1. **Data API exposure**  
   Confirm whether the project’s PostgREST / Data API is reachable with the **anon/publishable** key. If tables have RLS disabled and the Data API is enabled, anon clients could read/write tables directly, bypassing FastAPI.

2. **RLS on app tables**  
   Audit every public-schema table used by Playbyte. Prefer either:
   - RLS enabled with **no** permissive anon policies (deny-by-default), **or**
   - Data API disabled / schema not exposed to anon.

3. **Storage policies**  
   `share-cards`, `avatars`, `moment-media` allow public **SELECT**. Writes must remain service-role only (no insert/update policies for anon). `exports` should stay private (signed URLs only).

4. **Key separation**  
   - Railway: `SUPABASE_SERVICE_ROLE_KEY` = secret key  
   - Mobile/EAS: `EXPO_PUBLIC_SUPABASE_ANON_KEY` = publishable/anon only  

5. **Share-card production failures**  
   Opaque 500 on Railway is treated as an **ops/config** issue (bucket + service key), not a client bug. Code path maps storage misconfig/upload failures to `503 storage_unavailable` when the deployed build includes that mapping. See `docs/runbooks/share-card-storage.md`.

## What was not done in this pass

- No live Supabase dashboard audit of RLS policies.
- No confirmation that Data API is disabled for the production project.
- Do not claim “security complete” until (1)–(3) are verified in the hosted project.
