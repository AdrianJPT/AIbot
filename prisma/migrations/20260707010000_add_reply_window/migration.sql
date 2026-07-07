-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "replyWindowMs" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "pendingFlushAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Conversation_pendingFlushAt_idx" ON "Conversation"("pendingFlushAt");
