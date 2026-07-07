DROP INDEX IF EXISTS "Credential_ownerId_kind_status_idx";
ALTER TABLE "Credential" DROP COLUMN "status";
CREATE INDEX "Credential_ownerId_kind_idx" ON "Credential"("ownerId", "kind");
