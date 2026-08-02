import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  cleanupOwnershipFixtures,
  createTestBusinessWithNumber,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";
import { buildInboundTextPayload } from "@/lib/__tests__/fixtures/webhook-payload";

/**
 * Real-Postgres tests for the properties resumable dispatch exists to
 * guarantee (see design §2-4 and the spec's "Reply Dispatch Resumability"
 * domain): a crash after ingest still gets its reply, two racing attempts
 * never double-send, and a crashed claim gets reclaimed instead of orphaned
 * forever. `message-handler-idempotency.test.ts` mocks `../db`, so it
 * structurally cannot exercise the real `Message.dispatchId` unique
 * constraint or genuine concurrent Postgres transactions — these tests can.
 *
 * Only the AI/WhatsApp boundary is mocked; `../db`, `../message-handler`,
 * and `../reply-window-scheduler` are all real.
 */

const generateResponse = vi.fn();
vi.mock("../ai/generate", () => ({
  generateResponse: (...args: unknown[]) => generateResponse(...args),
}));

vi.mock("../ai/resolve", () => ({
  callWithAiCredential: (
    _business: unknown,
    fn: (client: unknown) => unknown,
  ) => fn({ marker: "fake-ai-client" }),
  resolveModels: async () => ({
    chatModel: "gpt-4o-mini",
    visionModel: "gpt-4o-mini",
    audioModel: "whisper-1",
  }),
}));

const sendFromNumber = vi.fn();
vi.mock("../whatsapp", () => ({
  sendFromNumber: (...args: unknown[]) => sendFromNumber(...args),
  resolveWhatsappToken: vi.fn().mockResolvedValue("test-token"),
}));

const logEvent = vi.fn();
vi.mock("../log", () => ({
  logEvent: (...args: unknown[]) => logEvent(...args),
}));

const {
  processWebhookPayload,
  sendAndPersistReply,
  computeDispatchId,
  reapStrandedSends,
  MAX_DISPATCH_ATTEMPTS,
} = await import("../message-handler");
const { sweepDueConversations } = await import("../reply-window-scheduler");
const { runDrain } = await import("../outbox/drain");

const ownerIds: string[] = [];

afterAll(async () => {
  await cleanupOwnershipFixtures(ownerIds);
});

async function setupBusiness(suffix: string) {
  const user = await createTestUser(`dispatch-${suffix}`);
  ownerIds.push(user.id);
  const business = await createTestBusinessWithNumber(user.id, suffix);
  return { business, phoneNumber: business.phoneNumbers[0] };
}

// Module-scope (not per-test) — Message.wamid is unique across the whole
// table (not scoped per conversation), and this file has no afterEach
// cleanup (only a final afterAll), so every real assistant Message row
// persisted by any test in this file shares the same live-until-afterAll
// table. A counter reset inside beforeEach would restart at
// "wamid.OUTBOUND_TEST_1" for every test and collide with whichever
// earlier test already claimed that exact string — silently caught by
// sendAndPersistReply's own catch block and misreported as a "failed"
// send, not a test-infra bug. Keeping the counter at module scope makes
// every wamid genuinely unique for the whole file's run.
let wamidSeq = 0;

beforeEach(() => {
  vi.clearAllMocks();
  generateResponse.mockResolvedValue("Respuesta generada");
  sendFromNumber.mockImplementation(() =>
    Promise.resolve(`wamid.OUTBOUND_TEST_${++wamidSeq}`),
  );
});

describe("dispatch resumability (real DB)", () => {
  it("a job interrupted after inbound persistence still gets its reply on a later sweep", async () => {
    const { phoneNumber } = await setupBusiness("resume");
    const from = "5215500000001";
    const wamid = `wamid.RESUME_${Date.now()}`;
    const payload = buildInboundTextPayload({
      phoneNumberId: phoneNumber.phoneNumberId,
      from,
      wamid,
      body: "Hola, ¿siguen abiertos?",
    });

    const touched = await processWebhookPayload(payload);
    expect(touched).toHaveLength(1);
    const conversationId = touched[0];

    // The crash boundary this whole change exists to make safe: ingest is
    // fully durable and nothing has been sent yet. If the process died right
    // here, the customer message and its due marker already survive it.
    expect(sendFromNumber).not.toHaveBeenCalled();
    const afterIngest = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    expect(afterIngest.pendingFlushAt).not.toBeNull();
    expect(
      await prisma.message.count({
        where: { conversationId, sentBy: "bot" },
      }),
    ).toBe(0);

    // A later, independent sweep — standing in for "a different process,
    // after a redeploy" — completes the dispatch.
    await sweepDueConversations({ conversationIds: [conversationId] });

    expect(sendFromNumber).toHaveBeenCalledTimes(1);
    const assistantMessages = await prisma.message.findMany({
      where: { conversationId, sentBy: "bot" },
    });
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0].status).toBe("sent");
    expect(assistantMessages[0].wamid).toEqual(
      expect.stringContaining("wamid.OUTBOUND_TEST_"),
    );

    const afterSweep = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    expect(afterSweep.pendingFlushAt).toBeNull();
    expect(afterSweep.flushLeaseUntil).toBeNull();
  });
});

describe("orphan reclaim after lease expiry (real DB)", () => {
  it("reclaims a conversation whose flush crashed between claim and send", async () => {
    const { business, phoneNumber } = await setupBusiness("orphan");
    // Simulates a worker that claimed the lease and then crashed before ever
    // sending. Under the old bug (pendingFlushAt nulled with no expiry) this
    // conversation would be orphaned forever — the due query would never see
    // it again. The lease's expiry makes it reclaimable.
    const conversation = await prisma.conversation.create({
      data: {
        businessId: business.id,
        phoneNumberId: phoneNumber.id,
        customerPhone: "5215500000002",
        status: "active",
        pendingFlushAt: new Date(Date.now() - 1000),
        flushLeaseUntil: new Date(Date.now() - 500),
      },
    });
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: "¿Tienen delivery?",
        sentBy: "customer",
      },
    });

    await sweepDueConversations({ conversationIds: [conversation.id] });

    expect(sendFromNumber).toHaveBeenCalledTimes(1);
    const assistantMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id, sentBy: "bot" },
    });
    expect(assistantMessages).toHaveLength(1);

    const fresh = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
    });
    expect(fresh.pendingFlushAt).toBeNull();
    expect(fresh.flushLeaseUntil).toBeNull();
  });
});

describe("concurrent claim safety on the flush lease (real DB)", () => {
  it("two overlapping sweeps on the same due conversation result in exactly one claim and one send", async () => {
    const { business, phoneNumber } = await setupBusiness("claim");
    const conversation = await prisma.conversation.create({
      data: {
        businessId: business.id,
        phoneNumberId: phoneNumber.id,
        customerPhone: "5215500000004",
        status: "active",
        pendingFlushAt: new Date(Date.now() - 1000),
      },
    });
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: "hola",
        sentBy: "customer",
      },
    });

    // Both sweeps race the same compare-and-set claim
    // (pendingFlushAt = claimedValue AND flushLeaseUntil null-or-expired).
    // Exactly one UPDATE can match; the second sees the first's lease
    // already set and skips.
    await Promise.all([
      sweepDueConversations({ conversationIds: [conversation.id] }),
      sweepDueConversations({ conversationIds: [conversation.id] }),
    ]);

    expect(sendFromNumber).toHaveBeenCalledTimes(1);
    const assistantMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id, sentBy: "bot" },
    });
    expect(assistantMessages).toHaveLength(1);
  });
});

describe("no-double-send under a dispatchId race (real DB)", () => {
  it("two concurrent sendAndPersistReply calls with the same dispatchId send exactly once", async () => {
    const { business, phoneNumber } = await setupBusiness("race");
    const conversation = await prisma.conversation.create({
      data: {
        businessId: business.id,
        phoneNumberId: phoneNumber.id,
        customerPhone: "5215500000003",
        status: "active",
      },
    });
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: "hola",
        sentBy: "customer",
      },
    });
    const dispatchId = computeDispatchId(conversation.id, [message.id]);

    const attempt = () =>
      sendAndPersistReply(
        business,
        phoneNumber,
        conversation.id,
        conversation.customerPhone,
        "Respuesta",
        dispatchId,
        [message.id],
      );

    // Neither call throws: the unique constraint on Message.dispatchId
    // rejects the loser's transaction, and sendAndPersistReply treats that
    // as "already dispatched", not an error to propagate.
    await Promise.all([attempt(), attempt()]);

    const assistantMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id, sentBy: "bot" },
    });
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0].dispatchId).toBe(dispatchId);
    expect(sendFromNumber).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith(
      "error",
      "whatsapp-send",
      expect.stringContaining("dispatchId"),
      expect.objectContaining({ dispatchId }),
      business.id,
      phoneNumber.id,
    );
  });
});

describe("sendAndPersistReply's transaction persists batchedAt (real DB)", () => {
  it("marks the answered customer messages batchedAt in the same transaction that creates the pending assistant row", async () => {
    const { business, phoneNumber } = await setupBusiness("batchedat");
    const conversation = await prisma.conversation.create({
      data: {
        businessId: business.id,
        phoneNumberId: phoneNumber.id,
        customerPhone: "5215500000005",
        status: "active",
      },
    });
    const customerMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: "¿Hacen envíos?",
        sentBy: "customer",
      },
    });
    expect(customerMessage.batchedAt).toBeNull();
    const dispatchId = computeDispatchId(conversation.id, [customerMessage.id]);

    await sendAndPersistReply(
      business,
      phoneNumber,
      conversation.id,
      conversation.customerPhone,
      "Sí, hacemos envíos",
      dispatchId,
      [customerMessage.id],
    );

    // This is the exact property CRITICAL #1 depended on: batchedAt commits
    // before the send resolves, which is what makes a crash mid-send
    // invisible to doFlush's `batchedAt: null` re-query on any later sweep.
    const afterSend = await prisma.message.findUniqueOrThrow({
      where: { id: customerMessage.id },
    });
    expect(afterSend.batchedAt).not.toBeNull();

    const assistantMessage = await prisma.message.findFirstOrThrow({
      where: { conversationId: conversation.id, sentBy: "bot" },
    });
    expect(assistantMessage.status).toBe("sent");
  });
});

describe("stranded-send reaper (real DB)", () => {
  it("recovers and delivers a reply stranded pending after batchedAt already committed (crash mid-send)", async () => {
    const { business, phoneNumber } = await setupBusiness("reaper-recover");
    const conversation = await prisma.conversation.create({
      data: {
        businessId: business.id,
        phoneNumberId: phoneNumber.id,
        customerPhone: "5215500000006",
        status: "active",
      },
    });
    // Exactly the CRITICAL #1 state: sendAndPersistReply's transaction
    // committed (customer message already batchedAt, assistant row already
    // created) but the process died before sendFromNumber ever resolved.
    const customerMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: "¿Cuál es el horario?",
        sentBy: "customer",
        batchedAt: new Date(Date.now() - 10 * 60_000),
      },
    });
    const dispatchId = computeDispatchId(conversation.id, [customerMessage.id]);
    const stranded = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: "Abrimos de 9 a 18h",
        mediaType: "text",
        sentBy: "bot",
        status: "pending",
        dispatchId,
        createdAt: new Date(Date.now() - 10 * 60_000), // clears the reaper's staleness gate
      },
    });

    // Confirm doFlush's own re-query genuinely finds nothing for this
    // conversation — this is why nothing but the reaper can ever recover it.
    expect(
      await prisma.message.count({
        where: {
          conversationId: conversation.id,
          sentBy: "customer",
          batchedAt: null,
        },
      }),
    ).toBe(0);

    // Goes through the actual production entry point (the unscoped/
    // scheduled drain — src/lib/outbox/drain.ts) rather than calling the
    // reaper directly, so this test also proves the wiring, not just the
    // reaper function in isolation. Before this fix, nothing reachable from
    // runDrain ever looked at this row again — this call is a no-op and the
    // assertions below fail.
    await runDrain();

    expect(sendFromNumber).toHaveBeenCalledTimes(1);
    const recovered = await prisma.message.findUniqueOrThrow({
      where: { id: stranded.id },
    });
    expect(recovered.status).toBe("sent");
    expect(recovered.wamid).toEqual(
      expect.stringContaining("wamid.OUTBOUND_TEST_"),
    );
  });

  it('does not resend a reply that already reached "sent"', async () => {
    const { business, phoneNumber } = await setupBusiness("reaper-sent");
    const conversation = await prisma.conversation.create({
      data: {
        businessId: business.id,
        phoneNumberId: phoneNumber.id,
        customerPhone: "5215500000007",
        status: "active",
      },
    });
    const alreadySent = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: "Ya enviado",
        mediaType: "text",
        sentBy: "bot",
        status: "sent",
        wamid: "wamid.ALREADY_SENT",
        dispatchId: computeDispatchId(conversation.id, ["already-sent-marker"]),
        createdAt: new Date(Date.now() - 10 * 60_000),
      },
    });

    await reapStrandedSends();

    expect(sendFromNumber).not.toHaveBeenCalled();
    const unchanged = await prisma.message.findUniqueOrThrow({
      where: { id: alreadySent.id },
    });
    expect(unchanged.status).toBe("sent");
    expect(unchanged.wamid).toBe("wamid.ALREADY_SENT");
  });

  it('a permanently failing send terminates in "failed" instead of retrying forever', async () => {
    const { business, phoneNumber } = await setupBusiness("reaper-terminal");
    const conversation = await prisma.conversation.create({
      data: {
        businessId: business.id,
        phoneNumberId: phoneNumber.id,
        customerPhone: "5215500000008",
        status: "active",
      },
    });
    const stranded = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: "No se puede enviar",
        mediaType: "text",
        sentBy: "bot",
        status: "pending",
        dispatchId: computeDispatchId(conversation.id, ["terminal-marker"]),
        dispatchAttempts: MAX_DISPATCH_ATTEMPTS - 1,
        createdAt: new Date(Date.now() - 10 * 60_000),
      },
    });
    sendFromNumber.mockRejectedValueOnce(
      new Error("permanent WhatsApp failure"),
    );

    await reapStrandedSends();

    expect(sendFromNumber).toHaveBeenCalledTimes(1);
    const terminal = await prisma.message.findUniqueOrThrow({
      where: { id: stranded.id },
    });
    expect(terminal.status).toBe("failed");
    expect(terminal.dispatchAttempts).toBe(MAX_DISPATCH_ATTEMPTS);

    // A second reap tick must not touch it again — it's terminal, not just
    // out of budget for this run.
    await reapStrandedSends();
    expect(sendFromNumber).toHaveBeenCalledTimes(1);
  });
});
