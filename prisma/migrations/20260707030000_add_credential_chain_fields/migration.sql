-- AlterTable
ALTER TABLE "Credential" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "AppConfig" DROP COLUMN "aiCredentialId";

-- Backfill: give pre-existing "ai" credentials a distinct priority matching
-- their current implicit order (createdAt asc). Without this every row
-- would default to 0, and the first reorder swap in /settings/credentials
-- would be a no-op (swapping two credentials that are both priority 0).
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "ownerId", "kind" ORDER BY "createdAt" ASC) - 1 AS rn
  FROM "Credential"
  WHERE "kind" = 'ai'
)
UPDATE "Credential" c
SET "priority" = ranked.rn
FROM ranked
WHERE c."id" = ranked.id;
