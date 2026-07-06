-- AppConfig is never read through PostgREST or Supabase Realtime — all app
-- access goes through Prisma, which connects as the table owner and
-- therefore bypasses RLS. Enabling RLS with no policy denies access to the
-- anon/authenticated roles, keeping this table out of the "public anon key
-- can read/write" exposure the Supabase security advisor flags for new
-- tables (same treatment as Credential/EventLog in 20260706000000).

ALTER TABLE "AppConfig" ENABLE ROW LEVEL SECURITY;
