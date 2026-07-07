-- Enable Row Level Security on Prisma's own migration-history table.
--
-- "_prisma_migrations" is created by the Prisma migrate engine and was left
-- out of the earlier RLS sweep (20260706000000_enable_rls_remaining_tables)
-- because it isn't an app table. It still lives in the public schema, so
-- Supabase's advisor flags it as exposed to PostgREST/anon (rls_disabled_in_public).
-- The migrate engine connects as the table owner and bypasses RLS, so enabling
-- it with no policies is a no-op for deploys and closes the exposure.

ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
