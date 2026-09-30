-- Close the Supabase Data API (PostgREST) on app tables.
--
-- The API connects as `postgres` (bypasses RLS) and no client reads tables through the Data API:
-- the apps only use Supabase Auth and public storage URLs. Tables were created without RLS, and
-- Supabase grants `anon` / `authenticated` full table privileges by default, so anyone holding the
-- publishable key shipped in the app could read and write every table (users, admin_users, plays...).
--
-- Deny by default: RLS on with no policies, and no table privileges for the client roles.
-- Idempotent; safe to re-run.

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Tables created later by postgres (future migrations) start closed too.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
