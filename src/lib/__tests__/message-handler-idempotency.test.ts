import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildBusiness, buildPhoneNumber } from "./fixtures/business";
import { buildAiReply } from "./fixtures/ai-reply";
import { textMessagePayload } from "./fixtures/webhook-payload";

const findFirstPhoneNumber = vi.fn();
const findFirstMessage = vi.fn();
const conversationUpsert = vi.fn();
const messageCreate = vi.fn();
const messageFindMany = vi.fn();
const messageUpdate = vi.fn();
const messageUpdateMany = vi.fn();
const messageCount = vi.fn();

const conversationUpdate = vi.fn();
const conversationFindMany = vi.fn();
const conversationUpdateMany = vi.fn();
const conversationFindUnique = vi.fn();

vi.mock("../db", () => ({
  prisma: {
    phoneNumber: {
      findFirst: (...args: unknown[]) => findFirstPhoneNumber(...args),
    },
    conversation: {
      upsert: (...args: unknown[]) => conversationUpsert(...args),
      update: (...args: unknown[]) => conversationUpdate(...args),
      findMany: (...args: unknown[]) => conversationFindMany(...args),
      updateMany: (...args: unknown[]) => conversationUpdateMany(...args),
      findUnique: (...args: unknown[]) => conversationFindUnique(...args),
    },
    message: {
      create: (...args: unknown[]) => messageCreate(...args),
      findFirst: (...args: unknown[]) => findFirstMessage(...args),
      findMany: (...args: unknown[]) => messageFindMany(...args),
      update: (...args: unknown[]) => messageUpdate(...args),
      updateMany: (...args: unknown[]) => messageUpdateMany(...args),
      count: (...args: unknown[]) => messageCount(...args),
    },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  },
}));

const generateResponse = vi.fn();
vi.mock("../ai/generate", () => ({
  generateResponse: (...args: unknown[]) => generateResponse(...args),
}));

const fakeAiClient = { marker: "fake-ai-client" };
const callWithAiCredential = vi.fn(
  (_business: unknown, fn: (client: unknown) => unknown) => fn(fakeAiClient),
);
vi.mock("../ai/resolve", () => ({
  callWithAiCredential: (...args: Parameters<typeof callWithAiCredential>) =>
    callWithAiCredential(...args),
  resolveModels: async () => ({
    chatModel: "gpt-4o-mini",
    visionModel: "gpt-4o-mini",
    audioModel: "whisper-1",
  }),
}));

const sendFromNumber = vi.fn();
const resolveWhatsappToken = vi.fn();
vi.mock("../whatsapp", () => ({
  sendFromNumber: (...args: unknown[]) => sendFromNumber(...args),
  resolveWhatsappToken: (...args: unknown[]) => resolveWhatsappToken(...args),
}));

const { processWebhookPayload } = await import("../message-handler");
const { sweepDueConversations } = await import("../reply-window-scheduler");

const business = buildBusiness();

const phoneNumber = buildPhoneNumber();

/**
 * Mirrors production wiring exactly (src/lib/outbox/drain.ts): ingest, then
 * — only if something was actually persisted — a sweep scoped to the
 * touched conversations. The single most important regression test in this
 * change: replaying one wamid across the ingest/dispatch split must still
 * yield exactly one user + one assistant message and one WhatsApp send, now
 * that the two are separate jobs instead of one uninterrupted call.
 */
async function runIngestThenSweep(payload: unknown): Promise<string[]> {
  const touched = await processWebhookPayload(payload);
  if (touched.length > 0) {
    await sweepDueConversations({ conversationIds: touched });
  }
  return touched;
}

beforeEach(() => {
  vi.clearAllMocks();
  findFirstPhoneNumber.mockResolvedValue({ ...phoneNumber, business });
  conversationUpsert.mockResolvedValue({
    id: "conv_1",
    businessId: business.id,
    phoneNumberId: phoneNumber.id,
    customerPhone: "5215512345678",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  conversationUpdate.mockResolvedValue({});
  conversationFindMany.mockResolvedValue([
    {
      id: "conv_1",
      businessId: business.id,
      phoneNumberId: phoneNumber.id,
      customerPhone: "5215512345678",
      status: "active",
      pendingFlushAt: new Date(Date.now() - 1000),
      flushLeaseUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  conversationUpdateMany.mockResolvedValue({ count: 1 });
  conversationFindUnique.mockResolvedValue({
    id: "conv_1",
    businessId: business.id,
    phoneNumberId: phoneNumber.id,
    customerPhone: "5215512345678",
    status: "active",
    pendingFlushAt: new Date(),
    flushLeaseUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    business,
    phoneNumber,
  });
  messageCreate.mockResolvedValue({ id: "msg_out_1" });
  messageFindMany.mockImplementation(
    (args: { where: Record<string, unknown> }) => {
      if (args.where.sentBy === "customer" && args.where.batchedAt === null) {
        return Promise.resolve([
          {
            id: "msg_user_1",
            content: "Hola, quiero hacer una reserva",
            mediaType: "text",
            createdAt: new Date(Date.now() - 500),
          },
        ]);
      }
      return Promise.resolve([]); // history query
    },
  );
  messageUpdate.mockResolvedValue({});
  messageUpdateMany.mockResolvedValue({ count: 1 });
  messageCount.mockResolvedValue(0);
  generateResponse.mockResolvedValue(buildAiReply());
  resolveWhatsappToken.mockResolvedValue("test-token");
  sendFromNumber.mockResolvedValue("wamid.OUTBOUND_001");
});

describe("webhook idempotency (dedupe retries)", () => {
  it("replaying the same wamid across ingest-then-sweep creates exactly one user + one assistant message and sends exactly once", async () => {
    // First delivery: no existing message with this wamid yet.
    findFirstMessage.mockResolvedValueOnce(null);
    const firstTouched = await runIngestThenSweep(textMessagePayload);
    expect(firstTouched).toEqual(["conv_1"]);
    expect(messageCreate).toHaveBeenCalledTimes(2); // user (ingest) + assistant (sweep)
    expect(messageCreate.mock.calls[0][0].data).toMatchObject({
      wamid: "wamid.TEXT_MESSAGE_ID_001",
    });
    expect(sendFromNumber).toHaveBeenCalledTimes(1);

    // Meta retries the same webhook: the dedupe pre-check now finds the
    // persisted wamid, so ingest returns before ever marking a conversation
    // due — the retry never even reaches the sweep.
    findFirstMessage.mockResolvedValueOnce({
      id: "msg_1",
      wamid: "wamid.TEXT_MESSAGE_ID_001",
    });
    const secondTouched = await runIngestThenSweep(textMessagePayload);

    expect(secondTouched).toEqual([]);
    // No additional messages created and no duplicate reply sent.
    expect(messageCreate).toHaveBeenCalledTimes(2);
    expect(sendFromNumber).toHaveBeenCalledTimes(1);
  });
});
