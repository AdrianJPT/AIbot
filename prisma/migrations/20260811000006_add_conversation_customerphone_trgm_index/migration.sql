-- Scale-safe conversation list loading, slice 1 (D4). Depends on
-- `20260811000004_enable_pg_trgm_extension` having run first. See that
-- file, `20260811000005_add_conversation_customername_trgm_index` (same
-- `public.gin_trgm_ops` qualification rationale) and
-- `20260811000000_add_conversation_lastmessageat_index` for the
-- one-statement-per-file rationale and the Supabase-privilege fallback
-- instructions (`fallback-btree.sql`, this same folder).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Conversation_customerPhone_trgm_idx" ON "Conversation" USING gin ("customerPhone" public.gin_trgm_ops);
