-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "unreadCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "sentBy" TEXT NOT NULL DEFAULT 'bot',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'sent';

-- CreateIndex
CREATE INDEX "Conversation_businessId_lastMessageAt_idx" ON "Conversation"("businessId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- Backfill: derive sentBy from the pre-existing role column.
-- role = "user" was always a customer-originated message; everything else
-- ("assistant") was produced by the bot. `sentBy = "human"` only starts
-- applying going forward (manual sends set it explicitly).
UPDATE "Message" SET "sentBy" = 'customer' WHERE "role" = 'user';
UPDATE "Message" SET "sentBy" = 'bot' WHERE "role" != 'user';

-- Backfill: lastMessageAt should reflect the conversation's most recent
-- message, falling back to createdAt for conversations with no messages yet.
UPDATE "Conversation" c
SET "lastMessageAt" = COALESCE(
  (SELECT MAX(m."createdAt") FROM "Message" m WHERE m."conversationId" = c.id),
  c."createdAt"
);
