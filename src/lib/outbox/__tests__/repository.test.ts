import { afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient, WebhookEventStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  cleanupWebhookEvents,
  createTestWebhookEvent,
} from "@/lib/__tests__/fixtures/business";
import {
  claimBatch,
  complete,
  enqueue,
  expireStale,
  fail,
} from "../repository";

// Only mocked here so the "unverified signature" integration test below
// doesn't also exercise the full drain/message-handler pipeline — that
// pipeline is out of scope for this file, which otherwise hits real
// Postgres directly through `../repository`, not through mocks.
vi.mock("../drain", () => ({
  runDrain: vi.fn().mockResolvedValue({
    claimed: 0,
    processed: 0,
    failed: 0,
    remaining: false,
  }),
}));

const createdIds: string[] = [];

async function tracked(
  overrides: Parameters<typeof createTestWebhookEvent>[0] = {},
) {
  const event = await createTestWebhookEvent(overrides);
  createdIds.push(event.id);
  return event;
}

describe("outbox/repository", () => {
  afterAll(async () => {
    await cleanupWebhookEvents(createdIds);
  });

  describe("enqueue", () => {
    it("enqueue persists rawPayload verbatim", async () => {
      const rawBody = JSON.stringify({ entry: [{ id: "wa-entry-1" }] });
      const event = await enqueue(rawBody);
      createdIds.push(event.id);

      expect(event.status).toBe(WebhookEventStatus.pending);
      expect(event.attempts).toBe(0);
      expect(event.rawPayload).toBe(rawBody);
      expect(event.payload).toBeNull();
    });

    it("a malformed non-JSON verified body is durably enqueued with rawPayload set and remains undispatched", async () => {
      const rawBody = "not json at all";
      const event = await enqueue(rawBody);
      createdIds.push(event.id);

      expect(event.rawPayload).toBe(rawBody);
      expect(event.payload).toBeNull();
      expect(event.status).toBe(WebhookEventStatus.pending);
    });
  });

  describe("POST /api/webhook (real DB durability boundary)", () => {
    it("an unverified (bad signature) request writes zero WebhookEvent rows", async () => {
      const { POST } = await import("@/app/api/webhook/route");
      const rawBody = JSON.stringify({ marker: "repository-unverified-test" });
      const req = new NextRequest("https://example.com/api/webhook", {
        method: "POST",
        body: rawBody,
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": "sha256=deadbeef",
        },
      });

      const before = await prisma.webhookEvent.count();
      const res = await POST(req);
      const after = await prisma.webhookEvent.count();

      expect(res.status).toBe(401);
      expect(after).toBe(before);
    });
  });

  describe("claimBatch", () => {
    it("claims a due pending row, sets the lease and increments attempts", async () => {
      const event = await tracked();

      // Scoped by eventId: other test files/blocks in this suite leave
      // their own pending rows behind (nothing here relies on the pending
      // pool being empty), so an unscoped claim would be order-dependent.
      const [claimed] = await claimBatch(10, 90, "worker-a", event.id);

      expect(claimed.id).toBe(event.id);
      expect(claimed.status).toBe(WebhookEventStatus.processing);
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
      const event = await tracked({ status: WebhookEventStatus.processing });

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
      // Negative TTL writes a leaseExpiresAt already in the past —
      // deterministic, no timers/sleeps.
      await claimBatch(10, -1, "worker-a", event.id);

      await expireStale();

      const reloaded = await prisma.webhookEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(reloaded.status).toBe(WebhookEventStatus.pending);
      expect(reloaded.leaseExpiresAt).toBeNull();
      expect(reloaded.lockedBy).toBeNull();
      expect(reloaded.lastError).toBe("lease expired");
    });

    it("marks a row failed once its lease expires at maxAttempts", async () => {
      const event = await tracked({ maxAttempts: 1 });
      await claimBatch(10, -1, "worker-a", event.id); // attempts -> 1 == maxAttempts

      await expireStale();

      const reloaded = await prisma.webhookEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(reloaded.status).toBe(WebhookEventStatus.failed);
    });

    it("does not touch pending or done rows", async () => {
      const pending = await tracked();
      const done = await tracked({ status: WebhookEventStatus.done });

      await expireStale();

      const [reloadedPending, reloadedDone] = await Promise.all([
        prisma.webhookEvent.findUniqueOrThrow({ where: { id: pending.id } }),
        prisma.webhookEvent.findUniqueOrThrow({ where: { id: done.id } }),
      ]);
      expect(reloadedPending.status).toBe(WebhookEventStatus.pending);
      expect(reloadedDone.status).toBe(WebhookEventStatus.done);
    });
  });

  describe("complete", () => {
    it("marks the row done and stamps processedAt", async () => {
      const event = await tracked();
      await claimBatch(10, 90, "worker-a", event.id);

      await complete(event.id);

      const reloaded = await prisma.webhookEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(reloaded.status).toBe(WebhookEventStatus.done);
      expect(reloaded.processedAt).not.toBeNull();
    });
  });

  describe("fail", () => {
    it("releases back to pending with a future nextRunAt when under maxAttempts", async () => {
      const event = await tracked({ maxAttempts: 5 });
      await claimBatch(10, 90, "worker-a", event.id); // attempts -> 1

      await fail(event.id, "boom");

      const reloaded = await prisma.webhookEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(reloaded.status).toBe(WebhookEventStatus.pending);
      expect(reloaded.lastError).toBe("boom");
      expect(reloaded.leaseExpiresAt).toBeNull();
      expect(reloaded.nextRunAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("marks terminally failed once attempts reach maxAttempts", async () => {
      const event = await tracked({ maxAttempts: 1 });
      await claimBatch(10, 90, "worker-a", event.id); // attempts -> 1 == maxAttempts

      await fail(event.id, "poison");

      const reloaded = await prisma.webhookEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(reloaded.status).toBe(WebhookEventStatus.failed);
      expect(reloaded.lastError).toBe("poison");
    });
  });

  describe("concurrent claims", () => {
    it("SKIP LOCKED guarantees each row is claimed by exactly one worker", async () => {
      // Earlier tests in this file leave some rows pending (never claimed by
      // id). ORDER BY nextRunAt ASC would let those older rows jump ahead of
      // the 20 seeded below, so drain them out of "pending" first — this
      // test only needs isolation of the pending pool, not of the table.
      await claimBatch(1000, 90, "concurrency-test-cleanup");

      const seeded = await Promise.all(
        Array.from({ length: 20 }, () => tracked()),
      );
      const seededIds = new Set(seeded.map((e) => e.id));

      // Two independent PrismaClients (not the shared singleton) so the
      // claims genuinely run as separate connections/transactions.
      const clientA = new PrismaClient();
      const clientB = new PrismaClient();
      try {
        const [claimedA, claimedB] = await Promise.all([
          claimWith(clientA, 10),
          claimWith(clientB, 10),
        ]);

        const claimedIds = [...claimedA, ...claimedB]
          .map((e) => e.id)
          .filter((id) => seededIds.has(id));

        expect(new Set(claimedIds).size).toBe(claimedIds.length); // no overlap
        expect(claimedIds).toHaveLength(20); // every seeded row claimed exactly once
      } finally {
        await clientA.$disconnect();
        await clientB.$disconnect();
      }
      // Generous timeout on purpose: the two `new PrismaClient()` above each
      // spawn their own query engine, and the suite now runs files in
      // parallel (vitest.config.ts), so that startup competes for CPU with
      // three other workers. The default 5s was calibrated for a serial run
      // and times out here roughly once every 25 runs. Nothing about the
      // assertions is timing-dependent — only the engine boot is.
    }, 30_000);
  });
});

async function claimWith(client: PrismaClient, limit: number) {
  return client.$queryRaw<Array<{ id: string }>>`UPDATE "WebhookEvent" e
    SET status = 'processing'::"WebhookEventStatus",
        attempts = e.attempts + 1,
        "leaseExpiresAt" = now() + make_interval(secs => 90),
        "lockedBy" = 'concurrent-test'
    WHERE e.id IN (
      SELECT id FROM "WebhookEvent"
      WHERE status = 'pending'::"WebhookEventStatus" AND "nextRunAt" <= now()
      ORDER BY "nextRunAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING e.*`;
}
