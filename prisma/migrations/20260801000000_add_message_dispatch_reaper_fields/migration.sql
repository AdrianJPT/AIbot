-- AlterTable
ALTER TABLE "Message" ADD COLUMN "dispatchAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Message" ADD COLUMN "dispatchLeaseUntil" TIMESTAMP(3);

-- Both statements are metadata-only in PG 11+ (constant default, nullable
-- column, no backfill). Old-container rows written during the deploy window
-- get dispatchAttempts = 0 / dispatchLeaseUntil = NULL via the DB default —
-- exactly the "never claimed yet" starting state a fresh row would have
-- anyway, so no reconciliation is needed.
