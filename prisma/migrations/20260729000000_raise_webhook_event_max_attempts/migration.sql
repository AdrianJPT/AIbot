-- AlterTable
ALTER TABLE "WebhookEvent" ALTER COLUMN "maxAttempts" SET DEFAULT 5;

-- Metadata-only: only the column DEFAULT changes. This does NOT mean
-- old-container-enqueued rows keep maxAttempts = 1 during the deploy
-- window — `enqueue()` (outbox/repository.ts) never sets maxAttempts
-- explicitly, so Prisma's generated INSERT omits the column entirely and
-- the database applies whatever DEFAULT is active at insert time. Once
-- this ALTER has run (pre-deploy, while the old container is still
-- serving), any row the old container enqueues gets maxAttempts = 5, not
-- 1. That's harmless here: a retried *ingest* re-hits the wamid dedupe
-- gate (message-handler.ts) and returns an empty touched-ids array, so
-- extra retry attempts can't cause a repeat send — they just mean more
-- retries than strictly needed for a handful of old-format rows.
