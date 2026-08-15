import { randomUUID } from "node:crypto";
import type { PaymentAnalysisEvent, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Real-DB `PaymentAnalysisEvent` row for `src/lib/payments/analysis-repository.ts`
 * and `analysis-job.ts` tests — same shape/purpose as `createTestWebhookEvent`
 * in `business.ts`, adapted to the payment-analysis outbox table.
 */
export async function createTestPaymentAnalysisEvent(
  overrides: Partial<{
    payload: Prisma.InputJsonValue;
    status: PaymentAnalysisEvent["status"];
    attempts: number;
    maxAttempts: number;
    nextRunAt: Date;
    leaseExpiresAt: Date | null;
    lockedBy: string | null;
    lastError: string | null;
  }> = {},
): Promise<PaymentAnalysisEvent> {
  return prisma.paymentAnalysisEvent.create({
    data: {
      payload: overrides.payload ?? { test: true },
      ...(overrides.status !== undefined && { status: overrides.status }),
      ...(overrides.attempts !== undefined && { attempts: overrides.attempts }),
      ...(overrides.maxAttempts !== undefined && {
        maxAttempts: overrides.maxAttempts,
      }),
      ...(overrides.nextRunAt !== undefined && {
        nextRunAt: overrides.nextRunAt,
      }),
      ...(overrides.leaseExpiresAt !== undefined && {
        leaseExpiresAt: overrides.leaseExpiresAt,
      }),
      ...(overrides.lockedBy !== undefined && { lockedBy: overrides.lockedBy }),
      ...(overrides.lastError !== undefined && {
        lastError: overrides.lastError,
      }),
    },
  });
}

/**
 * `PaymentAnalysisEvent` has no FK to Business/PaymentSession (mirrors
 * WebhookEvent — see schema.prisma), so `cleanupOwnershipFixtures` does not
 * cascade to it. Tests that create rows here must clean up explicitly.
 */
export async function cleanupPaymentAnalysisEvents(ids: string[]): Promise<void> {
  await prisma.paymentAnalysisEvent.deleteMany({ where: { id: { in: ids } } });
}

/** Random 8-digit-ish local suffix so parallel test files never collide on
 * `customerPhone`/business names. */
export function randomSuffix(): string {
  return randomUUID().slice(0, 8);
}
