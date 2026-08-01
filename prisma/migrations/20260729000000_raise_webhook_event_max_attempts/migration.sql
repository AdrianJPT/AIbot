-- AlterTable
ALTER TABLE "WebhookEvent" ALTER COLUMN "maxAttempts" SET DEFAULT 5;

-- Metadata-only: only affects rows inserted after this deploy. Events
-- enqueued by the still-running old container during `prisma migrate
-- deploy` keep maxAttempts = 1 — the conservative behavior for
-- old-format rows, since re-entry only became safe once the
-- ingest/dispatch split (this same release) landed.
