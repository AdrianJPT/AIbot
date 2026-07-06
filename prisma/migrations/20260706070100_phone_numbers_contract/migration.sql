-- DropIndex
DROP INDEX "Business_phoneNumberId_key";

-- DropIndex
DROP INDEX "Conversation_businessId_customerPhone_key";

-- AlterTable
ALTER TABLE "Business" DROP COLUMN "displayPhone",
DROP COLUMN "phoneNumberId",
DROP COLUMN "whatsappCredentialId",
DROP COLUMN "whatsappToken";

-- AlterTable
ALTER TABLE "Conversation" ALTER COLUMN "phoneNumberId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_phoneNumberId_customerPhone_key" ON "Conversation"("phoneNumberId", "customerPhone");

