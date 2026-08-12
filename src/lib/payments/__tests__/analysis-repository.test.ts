import { afterAll, describe, expect, it } from "vitest";
import { PaymentAnalysisEventStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  cleanupPaymentAnalysisEvents,
  createTestPaymentAnalysisEvent,
} from "@/lib/__tests__/fixtures/payments";
import { claimBatch, complete, enqueue, expireStale, fail } from "../analysis-repository";

const createdIds: string[] = [];

async function tracked(
  overrides: Parameters<typeof createTestPaymentAnalysisEvent>[0] = {},
) {
  const event = await createTestPaymentAnalysisEvent(overrides);
  createdIds.push(event.id);
  return event;
}

/**
 * Mirrors outbox/repository.test.ts's coverage for the WebhookEvent
 * claim/lease/backoff functions — same shape, applied to
 * `PaymentAnalysisEvent` (decision 6, tasks #568 PR2 phase 2). The heavy
 * concurrent-claim SKIP LOCKED stress test lives once in outbox/repository
 * .test.ts already (identical SQL shape); not duplicated here.
 */
describe("payments/analysis-repository", () => {
  afterAll(async () => {
    await cleanupPaymentAnalysisEvents(createdIds);
  });

  describe("enqueue", () => {
    it("persists the payload as a pending row", async () => {
      const payload = {
        sessionId: "sess_1",
        messageId: "msg_1",
        waMediaId: "wamedia_1",
        businessId: "biz_1",
        phoneNumberId: "phone_1",
        mediaType: "image" as const,
      };
      const event = await enqueue(payload);
      createdIds.push(event.id);

      expect(event.status).toBe(PaymentAnalysisEventStatus.pending);
      expect(event.attempts).toBe(0);
      expect(event.payload).toEqual(payload);
    });
  });

  describe("claimBatch", () => {
    it("claims a due pending row, sets the lease and increments attempts", async () => {
      const event = await tracked();

      const [claimed] = await claimBatch(10, 90, "worker-a", event.id);

      expect(claimed.id).toBe(event.id);
      expect(claimed.status).toBe(PaymentAnalysisEventStatus.processing);
      expect(claimed.attempts).toBe(1);
      expect(claimed.lockedBy).toBe("worker-a");
      expect(claimed.leaseExpiresAt).not.toBeNull();
    });

    it("does not claim a row whose nextRunAt is in the future", async () => {
      const event = await tracked({ nextRunAt: new Date(Date.now() + 60_000) });

      const claimed = await claimBatch(10, 90, "worker-a", event.id);

      expect(claimed).toHaveLength(0);
    });

    it("does not claim a row already processing", async () => {
      const event = await tracked({ status: PaymentAnalysisEventStatus.processing });

      const claimed = await claimBatch(10, 90, "worker-a", event.id);

      expect(claimed).toHaveLength(0);
    });

    it("scopes the claim to eventId when given", async () => {
      const target = await tracked();
      await tracked();

      const claimed = await claimBatch(10, 90, "worker-a", target.id);

      expect(claimed).toHaveLength(1);
      expect(claimed[0].id).toBe(target.id);
    });
  });

  describe("expireStale", () => {
    it("reclaims a row past its lease and below maxAttempts back to pending", async () => {
      const event = await tracked({ maxAttempts: 5 });
      await claimBatch(10, -1, "worker-a", event.id);

      await expireStale();

      const reloaded = await prisma.paymentAnalysisEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(reloaded.status).toBe(PaymentAnalysisEventStatus.pending);
      expect(reloaded.leaseExpiresAt).toBeNull();
      expect(reloaded.lockedBy).toBeNull();
      expect(reloaded.lastError).toBe("lease expired");
    });

    it("marks a row failed once its lease expires at maxAttempts", async () => {
      const event = await tracked({ maxAttempts: 1 });
      await claimBatch(10, -1, "worker-a", event.id);

      await expireStale();

      const reloaded = await prisma.paymentAnalysisEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(reloaded.status).toBe(PaymentAnalysisEventStatus.failed);
    });
  });

  describe("complete", () => {
    it("marks the row done and stamps processedAt", async () => {
      const event = await tracked();
      await claimBatch(10, 90, "worker-a", event.id);

      await complete(event.id);

      const reloaded = await prisma.paymentAnalysisEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(reloaded.status).toBe(PaymentAnalysisEventStatus.done);
      expect(reloaded.processedAt).not.toBeNull();
    });
  });

  describe("fail", () => {
    it("releases back to pending with a future nextRunAt when under maxAttempts", async () => {
      const event = await tracked({ maxAttempts: 5 });
      await claimBatch(10, 90, "worker-a", event.id);

      await fail(event.id, "boom");

      const reloaded = await prisma.paymentAnalysisEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(reloaded.status).toBe(PaymentAnalysisEventStatus.pending);
      expect(reloaded.lastError).toBe("boom");
      expect(reloaded.leaseExpiresAt).toBeNull();
      expect(reloaded.nextRunAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("marks terminally failed once attempts reach maxAttempts", async () => {
      const event = await tracked({ maxAttempts: 1 });
      await claimBatch(10, 90, "worker-a", event.id);

      await fail(event.id, "poison");

      const reloaded = await prisma.paymentAnalysisEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(reloaded.status).toBe(PaymentAnalysisEventStatus.failed);
      expect(reloaded.lastError).toBe("poison");
    });
  });

  describe("idempotency (claim-before-process contract)", () => {
    it("a completed row is never re-claimed by a later claimBatch", async () => {
      const event = await tracked();
      await claimBatch(10, 90, "worker-a", event.id);
      await complete(event.id);

      const reclaimed = await claimBatch(10, 90, "worker-b", event.id);

      expect(reclaimed).toHaveLength(0);
    });
  });
});
