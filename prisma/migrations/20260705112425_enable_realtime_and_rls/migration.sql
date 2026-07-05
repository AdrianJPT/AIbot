-- Supabase Realtime + Row Level Security for the chat feature.
--
-- This migration is SUPABASE-SPECIFIC. Against a real Supabase project it:
--   1. Adds "Message" and "Conversation" to the `supabase_realtime`
--      publication so Supabase Realtime streams INSERT/UPDATE events for
--      them to subscribed clients.
--   2. Enables Row Level Security on both tables with SELECT-only policies
--      that resolve ownership through Conversation -> Business -> ownerId,
--      matched against `auth.uid()`.
--
-- Against a plain local Postgres (no Supabase stack, e.g. the docker-compose
-- Postgres used for `prisma migrate dev` / tests) there is no
-- `supabase_realtime` publication and no `auth.uid()` function. Every
-- statement below is guarded so this migration is a documented NO-OP
-- locally and only takes effect against a real Supabase database. See
-- docs/plan/PHASE5_MANUAL_STEPS.md for the manual verification checklist to
-- run once this is applied to a real Supabase project.

-- 1) Realtime publication -----------------------------------------------
-- Only runs if the `supabase_realtime` publication already exists (it is
-- created by the Supabase platform itself, not by user migrations).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE "Message"';
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE "Conversation"';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    -- Table already added to the publication (safe to re-run).
    NULL;
END $$;

-- 2) Row Level Security ---------------------------------------------------
-- Enabling RLS is harmless on any Postgres, but the policies below depend
-- on `auth.uid()`, which only exists in the Supabase `auth` schema. Guard
-- policy creation on that function's presence so this migration does not
-- fail against a vanilla local Postgres.
ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    -- Conversation: readable when the caller owns the parent Business.
    EXECUTE $sql$
      CREATE POLICY "Conversation select by owner" ON "Conversation"
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM "Business" b
          WHERE b.id = "Conversation"."businessId"
            AND b."ownerId" = auth.uid()::text
        )
      )
    $sql$;

    -- Message: readable when the caller owns the Business behind the
    -- parent Conversation.
    EXECUTE $sql$
      CREATE POLICY "Message select by owner" ON "Message"
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM "Conversation" c
          JOIN "Business" b ON b.id = c."businessId"
          WHERE c.id = "Message"."conversationId"
            AND b."ownerId" = auth.uid()::text
        )
      )
    $sql$;

    -- No INSERT/UPDATE/DELETE policies: all writes go through Prisma using
    -- the service/direct connection, which bypasses RLS entirely (it does
    -- not authenticate as a Postgres role subject to these policies). RLS
    -- here exists solely to scope what Supabase Realtime (which respects
    -- RLS via the anon/authenticated roles) is allowed to stream to
    -- browser clients.
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    -- Policy already exists (safe to re-run).
    NULL;
END $$;
