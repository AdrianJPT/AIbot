-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "retryOfId" TEXT;

-- CreateIndex
CREATE INDEX "Message_retryOfId_idx" ON "Message"("retryOfId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_retryOfId_fkey" FOREIGN KEY ("retryOfId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
