-- CreateIndex
CREATE INDEX "Message_conversationId_sentBy_batchedAt_createdAt_idx" ON "Message"("conversationId", "sentBy", "batchedAt", "createdAt");

-- Index-only change, no data touched. Serves the flush-ceiling anchor lookup
-- (message-handler.ts's findOldestUnbatchedAt) and doFlush's pendingMessages
-- query (reply-window-scheduler.ts), both of which filter conversationId +
-- sentBy + batchedAt IS NULL ordered by createdAt.
--
-- Built non-concurrently, matching every other migration here: this runs as a
-- deploy step against a table whose row count is per-conversation message
-- history, and the ACCESS EXCLUSIVE lock is measured in milliseconds at that
-- scale. If Message ever grows large enough for the lock to matter, switch to
-- CREATE INDEX CONCURRENTLY in a standalone migration — it cannot run inside
-- Prisma's implicit transaction, so it needs its own file either way.
