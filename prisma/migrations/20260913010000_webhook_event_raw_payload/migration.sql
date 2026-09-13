-- Makes WebhookEvent.payload nullable and adds rawPayload/channel/provider.
-- Additive/backward-compatible: enqueue() now persists the verified raw
-- request body to rawPayload before any JSON.parse; payload stays null on
-- new rows until Unit 5's registry-based parsing populates it downstream.
-- Generated via `migrate diff --from-url <scratch> --to-schema-datamodel`
-- (see apply-progress.md "Migration Generation Method" for why `migrate dev`
-- itself cannot be used in this repository). Two spurious `DROP INDEX`
-- statements for pre-existing pg_trgm GIN indexes (unrelated drift, not
-- representable in schema.prisma) were excluded from the diff output.

-- AlterTable
ALTER TABLE "WebhookEvent" ADD COLUMN     "channel" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "rawPayload" TEXT,
ALTER COLUMN "payload" DROP NOT NULL;
