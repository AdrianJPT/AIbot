-- AlterTable
ALTER TABLE "PhoneNumber" ADD COLUMN     "cycleAnchorDate" TIMESTAMP(3),
ADD COLUMN     "planCode" TEXT;

-- CreateTable
CREATE TABLE "PhoneNumberUsageCycle" (
    "id" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "cycleStart" TIMESTAMP(3) NOT NULL,
    "cycleEnd" TIMESTAMP(3) NOT NULL,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "warnedAt80" BOOLEAN NOT NULL DEFAULT false,
    "warnedAt100" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneNumberUsageCycle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhoneNumberUsageCycle_phoneNumberId_cycleStart_key" ON "PhoneNumberUsageCycle"("phoneNumberId", "cycleStart");

-- AddForeignKey
ALTER TABLE "PhoneNumberUsageCycle" ADD CONSTRAINT "PhoneNumberUsageCycle_phoneNumberId_fkey" FOREIGN KEY ("phoneNumberId") REFERENCES "PhoneNumber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
