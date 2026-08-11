-- Scale-safe conversation list loading, slice 1 (D3). See the sibling
-- `20260811000000_add_conversation_lastmessageat_index/migration.sql` for
-- why this is one statement per file.
--
-- Daily AI-reply budget check (message-handler.ts's resolveAiReply /
-- alreadyNotifiedToday) — equality-then-range on sentBy + createdAt, bounds
-- the scan to today's bot messages platform-wide before joining Conversation
-- on businessId (covered by Conversation's [businessId,lastMessageAt]
-- prefix). `Message` is the other of the two largest tables in this schema.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_sentBy_createdAt_idx" ON "Message" ("sentBy", "createdAt");
