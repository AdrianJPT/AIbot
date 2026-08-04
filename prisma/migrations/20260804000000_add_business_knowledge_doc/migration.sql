-- AlterTable
ALTER TABLE "Business" ADD COLUMN "knowledgeDoc" TEXT;

-- Metadata-only in PG 11+ (nullable column, no default, no backfill). Rows
-- written by an older container during the deploy window get NULL, which is the
-- "no knowledge document" state a fresh row would have anyway, so nothing needs
-- reconciling. An older deploy reading the table ignores the column, because
-- Prisma enumerates columns explicitly rather than issuing SELECT *.
