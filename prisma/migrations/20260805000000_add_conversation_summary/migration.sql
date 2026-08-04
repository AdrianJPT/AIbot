-- AlterTable
ALTER TABLE "Business" ADD COLUMN "summaryEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Business" ADD COLUMN "summaryEveryNMessages" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "summary" JSONB;
ALTER TABLE "Conversation" ADD COLUMN "summarizedThroughAt" TIMESTAMP(3);

-- All four are metadata-only in PG 11+ (constant defaults, nullable columns, no
-- backfill). Nothing reads them yet: this migration ships the storage and the
-- summarizer, and the wiring that actually generates and consumes a summary
-- lands separately. So an older container running during the deploy window is
-- unaffected, and rows it writes get summaryEnabled = true /
-- summaryEveryNMessages = 10 / summary = NULL / summarizedThroughAt = NULL,
-- which is exactly the "no summary yet" starting state.
--
-- summaryEnabled defaults to true even though nothing consumes it, so that
-- turning the feature on later is a wiring change rather than a data migration.
-- The per-business kill switch is therefore available from the moment the
-- feature starts working.
