-- Scale-safe conversation list loading, slice 1. See the sibling
-- `20260811000000_add_conversation_lastmessageat_index/migration.sql` for
-- why this is one statement per file.
--
-- Admin "conversations today" / createdAt-ordered queries with no
-- `businessId` qualifier, same reasoning as the lastMessageAt index.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Conversation_createdAt_idx" ON "Conversation" ("createdAt");
