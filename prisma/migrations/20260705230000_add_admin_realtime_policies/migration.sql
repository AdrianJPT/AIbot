-- Admin realtime access via Row Level Security.
--
-- The owner-scoped SELECT policies from 20260705112425 only let a user
-- stream conversations/messages of businesses they own. Admins (User.role =
-- 'admin') must receive realtime events for EVERY conversation, so this
-- migration adds:
--   1. RLS on "User" with a select-self policy — required so the admin
--      policies below can resolve the caller's role without exposing other
--      users' rows to the anon/authenticated PostgREST roles.
--   2. Admin SELECT policies on "Conversation" and "Message" (policies are
--      OR-ed with the existing owner policies).
--
-- Same guard strategy as 20260705112425: everything is a documented NO-OP
-- on a plain local Postgres (no `auth.uid()` function) and only takes
-- effect against a real Supabase database.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    -- Each authenticated user can read only their own User row. This is
    -- what allows the admin policies below to check the caller's role.
    EXECUTE $sql$
      CREATE POLICY "User select self" ON "User"
      FOR SELECT
      USING (id = auth.uid()::text)
    $sql$;

    EXECUTE $sql$
      CREATE POLICY "Conversation select by admin" ON "Conversation"
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM "User" u
          WHERE u.id = auth.uid()::text
            AND u.role = 'admin'
        )
      )
    $sql$;

    EXECUTE $sql$
      CREATE POLICY "Message select by admin" ON "Message"
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM "User" u
          WHERE u.id = auth.uid()::text
            AND u.role = 'admin'
        )
      )
    $sql$;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    -- Policies already exist (safe to re-run).
    NULL;
END $$;
