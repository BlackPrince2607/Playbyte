-- Supabase Storage buckets for Playbyte (apply after 0001_init.sql)
-- Buckets are created idempotently. API uploads via service role; clients never receive service keys.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('share-cards', 'share-cards', true, 2097152, ARRAY['image/png']::text[]),
  ('avatars', 'avatars', true, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp']::text[]),
  ('exports', 'exports', false, 10485760, ARRAY['application/json']::text[]),
  ('moment-media', 'moment-media', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read for share cards and avatars (writes are service-role only via API).
-- CREATE POLICY does not support IF NOT EXISTS on current Postgres/Supabase.
DROP POLICY IF EXISTS share_cards_public_read ON storage.objects;
CREATE POLICY share_cards_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'share-cards');

DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
CREATE POLICY avatars_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS moment_media_public_read ON storage.objects;
CREATE POLICY moment_media_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'moment-media');

-- No public policies on exports; downloads use signed URLs from the API.

-- Document: Postgres tables remain API-only (no RLS). Supabase Auth users do not query tables directly.
-- All data access goes through FastAPI with JWT or guest token validation.
