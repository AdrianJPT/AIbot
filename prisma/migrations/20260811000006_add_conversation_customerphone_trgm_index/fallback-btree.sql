-- FALLBACK PATH for D4. See the sibling
-- `20260811000005_add_conversation_customername_trgm_index/fallback-btree.sql`
-- for the full explanation; this is the same fallback for `customerPhone`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Conversation_customerPhone_trgm_idx" ON "Conversation" ("customerPhone" text_pattern_ops);
