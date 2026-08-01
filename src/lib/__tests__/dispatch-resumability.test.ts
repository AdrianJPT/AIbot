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

const { processWebhookPayload, sendAndPersistReply, computeDispatchId } =
  await import("../message-handler");
const { sweepDueConversations } = await import("../reply-window-scheduler");

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

beforeEach(() => {
  vi.clearAllMocks();
  generateResponse.mockResolvedValue("Respuesta generada");
  // A distinct wamid per call — Message.wamid is unique across the whole
  // table (not scoped per conversation), and several tests in this file
  // persist a real assistant Message row against the same shared test DB
  // before the final afterAll cleanup runs, so a fixed literal here would
  // collide across tests exactly like a real duplicate wamid would.
  let wamidSeq = 0;
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
