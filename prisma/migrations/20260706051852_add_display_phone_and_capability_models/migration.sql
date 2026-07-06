-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "audioModel" TEXT NOT NULL DEFAULT 'whisper-1',
ADD COLUMN     "displayPhone" TEXT,
ADD COLUMN     "visionModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini';
