# Ops: Fix share-card 500 on hosted API

**Symptom:** `POST /v1/moments/{id}/share-card` returns `500 internal_error` (after a successful respond).

**Confirmed (2026-09-21 smoke):** still failing on `https://playbyte-production.up.railway.app` with opaque 500.

**Likely cause:** Supabase Storage bucket `share-cards` missing or service role not configured on Railway. Deployed build may also predate clearer `503 storage_unavailable` mapping (local code now maps config + upload failures to 503).

## Fix

1. In the Supabase project used by Railway (`EXPO_PUBLIC_SUPABASE_URL` / API `SUPABASE_URL`), run migration:

```sql
-- from supabase/migrations/0002_storage.sql
```

Or create bucket `share-cards` (public, PNG, 2MB) in Dashboard → Storage.

2. Confirm Railway API env has:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` = your **secret** key (`sb_secret_…`), not the publishable key
   - `SUPABASE_STORAGE_BUCKET_SHARES=share-cards` (optional; default matches)

   Env var name is legacy (`SERVICE_ROLE`); with Supabase’s new keys, the **secret** key goes there.
   Mobile/EAS should use the **publishable** key (`sb_publishable_…`) in `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

3. Redeploy API if env changed **and** to pick up storage client that sends both `apikey` + `Authorization` (required for `sb_secret_` keys).

4. Re-test:

```bash
python scripts/smoke_api.py https://playbyte-production.up.railway.app
# share-card step should PASS with assetUrl (or 503 with storage_unavailable if intentionally unavailable)
```

Mobile already surfaces share errors on the moment screen.
