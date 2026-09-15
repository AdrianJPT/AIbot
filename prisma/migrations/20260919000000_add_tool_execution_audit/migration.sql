-- CreateTable
CREATE TABLE "ToolExecutionAudit" (
    "id" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "sanitizedInput" TEXT,
    "outcome" TEXT NOT NULL,
    "failureCode" TEXT,
    "resultData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolExecutionAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ToolExecutionAudit_idempotencyKey_key" ON "ToolExecutionAudit"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ToolExecutionAudit_toolName_createdAt_idx" ON "ToolExecutionAudit"("toolName", "createdAt");
