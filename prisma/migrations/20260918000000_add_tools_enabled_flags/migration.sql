-- AlterTable
ALTER TABLE "AppConfig" ADD COLUMN     "toolsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "toolsEnabled" BOOLEAN NOT NULL DEFAULT false;
