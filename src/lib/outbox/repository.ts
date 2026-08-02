import { Prisma, WebhookEventStatus, type WebhookEvent } from "@prisma/client";
import { prisma } from "../db";

/**
 * Persists the raw payload as a `WebhookEvent` row before any
 * parsing/processing happens. This is the durability boundary: once this
 * resolves, the payload survives a crash even if nothing downstream ever
 * runs successfully.
 */
export async function enqueue(payload: unknown): Promise<WebhookEvent> {
  return prisma.webhookEvent.create({
    data: { payload: payload as Prisma.InputJsonValue },
  });
}

/**
 * Recovers rows orphaned by a worker that claimed them (`status=processing`)
 * and then crashed before calling `complete`/`fail`. Must run before
 * `claimBatch` on every drain tick — see the "why the two steps are
 * separate" note on `claimBatch` for why this can't be folded into the claim
 * query itself.
 *
 * A row that has already exhausted `maxAttempts` goes straight to `failed`
 * instead of back to `pending`, so a crashing worker can't keep an
 * unprocessable row cycling forever.
 */
export async function expireStale(): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "WebhookEvent"
    SET status = CASE WHEN attempts >= "maxAttempts"
                       THEN 'failed'::"WebhookEventStatus"
                       ELSE 'pending'::"WebhookEventStatus" END,
        "leaseExpiresAt" = NULL,
        "lockedBy" = NULL,
        "lastError" = COALESCE("lastError", 'lease expired'),
        "nextRunAt" = now()
    WHERE status = 'processing'::"WebhookEventStatus"
      AND "leaseExpiresAt" < now()
  `;
}

/**
 * Claims up to `limit` due, pending rows for `workerId` using
 * `FOR UPDATE SKIP LOCKED`, so the inline webhook path and a scheduled drain
 * can run concurrently without blocking each other on lock-wait — see the
 * design doc's "why SKIP LOCKED" section. `ttlSeconds` is a parameter (not a
 * constant) so tests can pass a negative value to write an
 * already-expired lease deterministically, with no timers or sleeps.
 *
 * When `eventId` is given, only that row is eligible — used by the inline
 * webhook path to drain exactly the event it just enqueued instead of
 * stealing unrelated pending work.
 */
export async function claimBatch(
  limit: number,
  ttlSeconds: number,
  workerId: string,
  eventId?: string,
): Promise<WebhookEvent[]> {
  const idFilter = eventId ? Prisma.sql`AND id = ${eventId}` : Prisma.empty;

  return prisma.$queryRaw<WebhookEvent[]>`
    UPDATE "WebhookEvent" e
    SET status = 'processing'::"WebhookEventStatus",
        attempts = e.attempts + 1,
        "leaseExpiresAt" = now() + make_interval(secs => ${ttlSeconds}),
        "lockedBy" = ${workerId}
    WHERE e.id IN (
      SELECT id FROM "WebhookEvent"
      WHERE status = 'pending'::"WebhookEventStatus" AND "nextRunAt" <= now()
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
  await prisma.webhookEvent.update({
    where: { id },
    data: { status: WebhookEventStatus.done, processedAt: new Date() },
  });
}

/**
 * Records a processing failure and releases the row for retry, or marks it
 * terminally `failed` once `maxAttempts` is reached. Backoff: 10s, 20s, 40s,
 * 80s, 160s, capped at 300s (only reachable once `maxAttempts` > 1, which PR1
 * never does — kept here because `expireStale`'s crash path and this
 * explicit-error path share the same cap logic).
 */
export async function fail(id: string, error: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "WebhookEvent"
    SET status = CASE WHEN attempts >= "maxAttempts" THEN 'failed' ELSE 'pending' END::"WebhookEventStatus",
        "lastError" = ${error},
        "leaseExpiresAt" = NULL,
        "lockedBy" = NULL,
        "nextRunAt" = now() + make_interval(secs => LEAST(POWER(2, attempts) * 5, 300))
    WHERE id = ${id}
  `;
}
