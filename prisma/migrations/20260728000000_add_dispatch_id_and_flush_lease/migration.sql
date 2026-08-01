-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "flushLeaseUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "dispatchId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Message_dispatchId_key" ON "Message"("dispatchId");

-- Both columns are nullable with no default: metadata-only ADD COLUMNs plus
-- one CREATE UNIQUE INDEX build (the app has no clients yet, so "Message" is
-- effectively empty and the build is milliseconds — see the design doc's
-- "Decision on the unique index: plain, not CONCURRENTLY" note). Old code
-- (the currently-running container during `prisma migrate deploy`) never
-- writes either column, so this is fully backwards-compatible.
--
-- No RLS statement here: "Conversation" and "Message" already have RLS
-- enabled (20260705112425_enable_realtime_and_rls) — these are columns on
-- already-protected tables, not a new table.
