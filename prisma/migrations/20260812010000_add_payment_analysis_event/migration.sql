-- Payment verification engine, slice 2 of 4: outbox-style analysis queue.
-- See docs/payment-verification-engine.md decision 6. Mirrors WebhookEvent
-- (prisma/schema.prisma:317 / src/lib/outbox/repository.ts) exactly, as its
-- own table so payload/semantics stay proof-analysis specific.
--
-- The two `pg_trgm` indexes (Conversation.customerName / customerPhone,
-- migrations 20260811000005/6) exist in the DB but aren't declared as
-- `@@index` in schema.prisma, so a raw `prisma migrate diff` against the
-- live test DB wants to drop them — unrelated to this change, stripped from
-- this file, same precedent as slice 1's migration.

-- CreateEnum
CREATE TYPE "PaymentAnalysisEventStatus" AS ENUM ('pending', 'processing', 'done', 'failed');

-- CreateTable
CREATE TABLE "PaymentAnalysisEvent" (
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "PaymentAnalysisEventStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseExpiresAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAnalysisEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentAnalysisEvent_status_nextRunAt_idx" ON "PaymentAnalysisEvent"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "PaymentAnalysisEvent_status_leaseExpiresAt_idx" ON "PaymentAnalysisEvent"("status", "leaseExpiresAt");
