-- AlterTable
ALTER TABLE "Business" ALTER COLUMN "model" DROP NOT NULL,
ALTER COLUMN "model" DROP DEFAULT,
ALTER COLUMN "audioModel" DROP NOT NULL,
ALTER COLUMN "audioModel" DROP DEFAULT,
ALTER COLUMN "visionModel" DROP NOT NULL,
ALTER COLUMN "visionModel" DROP DEFAULT;

-- CreateTable
CREATE TABLE "AppConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "aiCredentialId" TEXT,
    "chatModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "visionModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "audioModel" TEXT NOT NULL DEFAULT 'whisper-1',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);
