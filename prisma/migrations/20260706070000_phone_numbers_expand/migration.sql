-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "wabaId" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "phoneNumberId" TEXT;

-- AlterTable
ALTER TABLE "EventLog" ADD COLUMN     "phoneNumberId" TEXT;

-- CreateTable
CREATE TABLE "PhoneNumber" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "displayPhone" TEXT,
    "whatsappCredentialId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneNumber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhoneNumber_phoneNumberId_key" ON "PhoneNumber"("phoneNumberId");

-- CreateIndex
CREATE INDEX "PhoneNumber_businessId_idx" ON "PhoneNumber"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Business_wabaId_key" ON "Business"("wabaId");

-- CreateIndex
CREATE INDEX "Conversation_phoneNumberId_lastMessageAt_idx" ON "Conversation"("phoneNumberId", "lastMessageAt");

-- AddForeignKey
ALTER TABLE "PhoneNumber" ADD CONSTRAINT "PhoneNumber_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_phoneNumberId_fkey" FOREIGN KEY ("phoneNumberId") REFERENCES "PhoneNumber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

