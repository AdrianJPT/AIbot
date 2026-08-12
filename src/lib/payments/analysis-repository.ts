import {
  Prisma,
  PaymentAnalysisEventStatus,
  type PaymentAnalysisEvent,
} from "@prisma/client";
import { prisma } from "../db";

/**
 * Outbox-style repository for `PaymentAnalysisEvent` — same claim/lease/
 * backoff shape as `src/lib/outbox/repository.ts`'s `WebhookEvent`
 * functions (decision 6, tasks #568 PR2 phase 2). Kept as a parallel module
 * rather than a generic outbox abstraction over both tables: the two rows
 * have different payload shapes and different callers (webhook ingest vs.
 * proof-analysis ingest), and duplicating five small functions is cheaper
 * to read than a shared generic that has to parameterize the table name.
 */

export type PaymentAnalysisPayload = {
  sessionId: string;
  messageId: string;
  waMediaId: string;
  businessId: string;
  phoneNumberId: string;
  mediaType: "image" | "document";
};

/** Durability boundary: the analysis job never runs before this resolves. */
export async function enqueue(
  payload: PaymentAnalysisPayload,
): Promise<PaymentAnalysisEvent> {
  return prisma.paymentAnalysisEvent.create({
    data: { payload: payload as unknown as Prisma.InputJsonValue },
  });
}

/** Recovers rows orphaned by a worker that claimed then crashed — same
 * contract as outbox/repository.ts's `expireStale`. */
export async function expireStale(): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "PaymentAnalysisEvent"
    SET status = CASE WHEN attempts >= "maxAttempts"
                       THEN 'failed'::"PaymentAnalysisEventStatus"
                       ELSE 'pending'::"PaymentAnalysisEventStatus" END,
        "leaseExpiresAt" = NULL,
        "lockedBy" = NULL,
        "lastError" = COALESCE("lastError", 'lease expired'),
        "nextRunAt" = now()
    WHERE status = 'processing'::"PaymentAnalysisEventStatus"
      AND "leaseExpiresAt" < now()
  `;
}

/** Claims up to `limit` due, pending rows for `workerId` using
 * `FOR UPDATE SKIP LOCKED` — identical shape to outbox/repository.ts's
 * `claimBatch`, including the `eventId`-scoped single-row claim used by the
 * inline ingest path. */
export async function claimBatch(
  limit: number,
  ttlSeconds: number,
  workerId: string,
  eventId?: string,
): Promise<PaymentAnalysisEvent[]> {
  const idFilter = eventId ? Prisma.sql`AND id = ${eventId}` : Prisma.empty;

  return prisma.$queryRaw<PaymentAnalysisEvent[]>`
    UPDATE "PaymentAnalysisEvent" e
    SET status = 'processing'::"PaymentAnalysisEventStatus",
        attempts = e.attempts + 1,
        "leaseExpiresAt" = now() + make_interval(secs => ${ttlSeconds}),
        "lockedBy" = ${workerId}
    WHERE e.id IN (
      SELECT id FROM "PaymentAnalysisEvent"
      WHERE status = 'pending'::"PaymentAnalysisEventStatus" AND "nextRunAt" <= now()
      ${idFilter}
      ORDER BY "nextRunAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING e.*
  `;
}

/** Marks a claimed row as successfully processed. */
export async function complete(id: string): Promise<void> {
  await prisma.paymentAnalysisEvent.update({
    where: { id },
    data: { status: PaymentAnalysisEventStatus.done, processedAt: new Date() },
  });
}

/** Records a processing failure and releases the row for retry, or marks it
 * terminally `failed` once `maxAttempts` is reached — same backoff curve as
 * outbox/repository.ts's `fail` (10s, 20s, 40s, ... capped at 300s). */
export async function fail(id: string, error: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "PaymentAnalysisEvent"
    SET status = CASE WHEN attempts >= "maxAttempts" THEN 'failed' ELSE 'pending' END::"PaymentAnalysisEventStatus",
        "lastError" = ${error},
        "leaseExpiresAt" = NULL,
        "lockedBy" = NULL,
        "nextRunAt" = now() + make_interval(secs => LEAST(POWER(2, attempts) * 5, 300))
    WHERE id = ${id}
  `;
}
