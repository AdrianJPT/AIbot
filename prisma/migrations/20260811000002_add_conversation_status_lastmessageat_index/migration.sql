-- Scale-safe conversation list loading, slice 1 (D2). See the sibling
-- `20260811000000_add_conversation_lastmessageat_index/migration.sql` for
-- why this is one statement per file.
--
-- Admin status-tab filter+sort with no `businessId` qualifier. Tenant-scoped
-- status filtering is still served by [businessId,lastMessageAt] + a cheap
-- residual filter, so this composite is admin-only in practice.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Conversation_status_lastMessageAt_idx" ON "Conversation" ("status", "lastMessageAt");
