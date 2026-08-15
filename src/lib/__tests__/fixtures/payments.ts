import { randomUUID } from "node:crypto";
import type {
  PaymentAnalysisEvent,
  PaymentSessionStatus,
  PaymentVerdict,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveExpiresAt } from "@/lib/payments/state-machine";

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

/**
 * Shared seed helpers for the payments routes/scope test suites (tasks
 * #568 PR3). Route tests seed sessions/proofs directly rather than going
 * through the analysis job (mirrors analysis-job.test.ts's own local
 * `seedSessionAndMessage`, but shared here since 4+ route test files need
 * the same shape) — same "manual session seeding" precedent noted as a
 * PR2 gap (no catalog auto-matching at ingest time).
 */
export async function createTestPaymentSession(
  businessId: string,
  conversationId: string,
  customerPhone: string,
  overrides: Partial<{
    status: PaymentSessionStatus;
    statusReason: string | null;
    autonomyRounds: number;
    expectedAmount: number | null;
    receivedAmount: number;
  }> = {},
) {
  return prisma.paymentSession.create({
    data: {
      businessId,
      conversationId,
      customerPhone,
      status: overrides.status ?? "ready_to_confirm",
      statusReason: overrides.statusReason ?? null,
      autonomyRounds: overrides.autonomyRounds ?? 3,
      expectedAmount: overrides.expectedAmount ?? null,
      receivedAmount: overrides.receivedAmount ?? 0,
      expiresAt: resolveExpiresAt(new Date()),
    },
  });
}

export async function createTestPaymentProof(
  sessionId: string,
  overrides: Partial<{
    verdict: PaymentVerdict;
    confidence: number;
    amount: number | null;
    reference: string | null;
    mediaData: Buffer | null;
    mediaMimeType: string | null;
  }> = {},
) {
  return prisma.paymentProof.create({
    data: {
      sessionId,
      verdict: overrides.verdict ?? "valid",
      confidence: overrides.confidence ?? 0.95,
      reference: overrides.reference ?? null,
      mediaData:
        "mediaData" in overrides
          ? overrides.mediaData
          : Buffer.from("fake-proof-bytes"),
      mediaMimeType:
        "mediaMimeType" in overrides ? overrides.mediaMimeType : "image/jpeg",
      extracted: {
        amount: overrides.amount ?? 15000,
        currency: "MXN",
        paidAt: null,
        reference: overrides.reference ?? null,
        destinationAccount: null,
        payerName: null,
        transferStatus: "completed",
        tamperingScore: 0,
        imageHash: null,
        confidence: overrides.confidence ?? 0.95,
      },
    },
  });
}
