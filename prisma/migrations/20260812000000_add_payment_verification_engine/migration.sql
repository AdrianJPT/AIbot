-- Payment verification engine, slice 1 of 4 (models only — no wiring yet).
-- See docs/payment-verification-engine.md decisions 2, 3 and 9. Every new
-- table is inert until `Business.paymentsEnabled` is flipped on: nothing in
-- this slice reads or writes them.

-- CreateEnum
CREATE TYPE "PaymentSessionStatus" AS ENUM ('awaiting_proof', 'analyzing', 'customer_action', 'ready_to_confirm', 'confirmed', 'rejected', 'escalated', 'expired');

-- CreateEnum
CREATE TYPE "PaymentVerdict" AS ENUM ('valid', 'needs_attention', 'suspicious', 'invalid', 'duplicate');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "paymentsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSession" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "expectedAmount" INTEGER,
    "receivedAmount" INTEGER NOT NULL DEFAULT 0,
    "status" "PaymentSessionStatus" NOT NULL DEFAULT 'awaiting_proof',
    "statusReason" TEXT,
    "autonomyRounds" INTEGER NOT NULL DEFAULT 3,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProof" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "messageId" TEXT,
    "waMediaId" TEXT,
    "extracted" JSONB NOT NULL,
    "verdict" "PaymentVerdict" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reference" TEXT,
    "imageHash" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAuditEntry" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogItem_businessId_idx" ON "CatalogItem"("businessId");

-- CreateIndex
CREATE INDEX "PaymentSession_businessId_status_idx" ON "PaymentSession"("businessId", "status");

-- CreateIndex
CREATE INDEX "PaymentProof_sessionId_idx" ON "PaymentProof"("sessionId");

-- CreateIndex
CREATE INDEX "PaymentAuditEntry_sessionId_createdAt_idx" ON "PaymentAuditEntry"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PaymentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAuditEntry" ADD CONSTRAINT "PaymentAuditEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PaymentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
