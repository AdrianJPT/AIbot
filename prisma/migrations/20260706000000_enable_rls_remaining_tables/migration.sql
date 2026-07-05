-- Enable Row Level Security on every remaining public table.
--
-- These tables are never read through PostgREST or Supabase Realtime — all
-- app access goes through Prisma, which connects as the table owner and
-- therefore bypasses RLS. Enabling RLS with no (or minimal) policies denies
-- access to the anon/authenticated roles, closing the "public anon key can
-- read and write these tables" exposure flagged by the Supabase security
-- advisor, with zero impact on the application.
--
-- "Business" is the one exception that needs a policy: the owner-scoped
-- realtime policies on "Conversation"/"Message" (20260705112425) resolve
-- ownership via a subquery on "Business". With RLS enabled and no policy,
-- that subquery would return no rows for the authenticated role and client
-- realtime would silently stop matching — so owners keep SELECT on their
-- own businesses.
--
-- Same guard strategy as previous RLS migrations: policy creation is a
-- documented NO-OP on a plain local Postgres (no `auth.uid()` function).

ALTER TABLE "Business" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Credential" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventLog" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Business select by owner" ON "Business"
      FOR SELECT
      USING ("ownerId" = auth.uid()::text)
    $sql$;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    -- Policy already exists (safe to re-run).
    NULL;
END $$;
