-- Scale-safe conversation list loading, slice 1 (D4, search index).
--
-- PRIMARY PATH — pg_trgm GIN, preserves current mid-string ILIKE search
-- semantics on `customerName` / `customerPhone`. This file only enables the
-- extension; the actual `CONCURRENTLY` GIN indexes live in their own
-- sibling migration files for the same one-statement-per-file reason
-- documented in `20260811000000_add_conversation_lastmessageat_index`
-- (this file itself is a single `DO $$ ... $$` statement, so it does not
-- need that split, but it must run BEFORE the GIN index files regardless).
--
-- UNVERIFIED AGAINST THE ACTUAL SUPABASE PROJECT: this sandbox has no
-- credentials for the real Supabase project (only the local ephemeral test
-- Postgres, where the role is superuser and `CREATE EXTENSION pg_trgm`
-- trivially succeeds — that does NOT prove anything about Supabase's
-- managed, non-superuser `postgres` role). Supabase's public Database
-- Extensions documentation lists `pg_trgm` as an allow-listed extension
-- installable by project owners without superuser, so this is the expected
-- default path — but it must be confirmed once against the real project
-- before this migration is deployed there.
--
-- Deploy operator: run this file with `prisma migrate deploy` as usual. If
-- it fails with `permission denied to create extension "pg_trgm"` (or
-- similar insufficient_privilege error), CREATE EXTENSION is denied on this
-- Supabase project. In that case:
--   1. Do NOT apply the sibling GIN-index migrations
--      (`20260811000005_add_conversation_customername_trgm_index`,
--      `20260811000006_add_conversation_customerphone_trgm_index`) — they
--      depend on `gin_trgm_ops`, which will not exist.
--   2. Replace all three of this file and its two GIN-index siblings with
--      the fallback in `20260811000005.../fallback-btree.sql` (see that
--      folder), then re-run `prisma migrate deploy`.
--   3. Update `src/app/api/conversations/route.ts`'s search filter from
--      `contains` (ILIKE substring) to `startsWith` (prefix) in slice 2 (PR
--      2) — the fallback index cannot serve substring search — and note the
--      semantics change in that PR's description.
--
-- Installed into a fixed schema (`public`) rather than whatever schema is
-- first on `search_path`: extensions are database-wide singletons, so if
-- this ever runs against a non-default search_path (e.g. this repo's own
-- per-worker-schema test setup), an unqualified `CREATE EXTENSION` would
-- pin the operator class to whichever schema happened to create it first,
-- making it invisible to every other schema unless `public` is explicitly
-- on their search_path too.
--
-- Guarded in a DO block (same pattern as
-- `20260705112425_enable_realtime_and_rls`'s `ALTER PUBLICATION` guard):
-- extensions are database-wide, so this repo's parallel per-worker-schema
-- test setup can race two workers through `IF NOT EXISTS` at once — Postgres
-- raises a raw `unique_violation` on `pg_extension`'s catalog index in that
-- case (not `duplicate_object`, which is what `IF NOT EXISTS` alone
-- protects against), so both are caught here.
--
-- Not mirrored in schema.prisma: Prisma cannot express a GIN index with a
-- custom operator class (`gin_trgm_ops`) without the `postgresqlExtensions`
-- preview feature, which this project does not otherwise need. This is a
-- deliberate, accepted `prisma migrate diff` gap for this one index type,
-- same as the trgm extension itself.
DO $$
BEGIN
  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public';
EXCEPTION
  WHEN duplicate_object OR unique_violation THEN
    NULL; -- another concurrent session already created it
END $$;
