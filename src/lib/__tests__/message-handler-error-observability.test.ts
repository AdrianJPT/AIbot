import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildBusiness, buildPhoneNumber } from "./fixtures/business";
import { textMessagePayload } from "./fixtures/webhook-payload";

const findFirstPhoneNumber = vi.fn();
const findFirstMessage = vi.fn();
const conversationUpsert = vi.fn();
const messageCreate = vi.fn();
const messageFindMany = vi.fn();
const messageUpdate = vi.fn();
const messageUpdateMany = vi.fn();
const messageCount = vi.fn();
const eventLogCreate = vi.fn();

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
    eventLog: { create: (...args: unknown[]) => eventLogCreate(...args) },
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
 * AI failures and WhatsApp send failures both surface on the sweep now,
 * never during ingest — see design §3. Runs the real ingest-then-sweep
 * sequence (only db/ai/whatsapp mocked).
 */
async function runIngestThenSweep(payload: unknown): Promise<string[]> {
  const touched = await processWebhookPayload(payload);
  await sweepDueConversations({ conversationIds: touched });
  return touched;
}

beforeEach(() => {
  vi.clearAllMocks();
  findFirstPhoneNumber.mockResolvedValue({ ...phoneNumber, business });
  findFirstMessage.mockResolvedValue(null);
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
  eventLogCreate.mockResolvedValue({});
  generateResponse.mockResolvedValue("Respuesta generada");
  resolveWhatsappToken.mockResolvedValue("test-token");
  sendFromNumber.mockResolvedValue(undefined);
});

describe("error observability", () => {
  it("logs an EventLog row and stays silent toward the customer when the AI call fails", async () => {
    generateResponse.mockRejectedValue(new Error("OpenAI is down"));

    await runIngestThenSweep(textMessagePayload);

    // User message is still persisted at ingest.
    expect(messageCreate).toHaveBeenCalledTimes(1);
    expect(messageCreate.mock.calls[0][0].data).toMatchObject({ role: "user" });

    // No assistant fallback message is created or sent — the failure is
    // surfaced only via the Eventos tab, not as a customer-facing WhatsApp
    // message.
    expect(sendFromNumber).not.toHaveBeenCalled();

    expect(eventLogCreate).toHaveBeenCalledTimes(1);
    expect(eventLogCreate.mock.calls[0][0].data).toMatchObject({
      level: "error",
      source: "ai",
    });

    // The batch is still marked consumed — resolveAiReply already swallowed
    // the error and returned null, which is a decided (not crashed) outcome.
    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["msg_user_1"] } },
      data: { batchedAt: expect.any(Date) },
    });
  });

  it("logs an EventLog row when the WhatsApp send fails, without throwing", async () => {
    sendFromNumber.mockRejectedValue(new Error("WhatsApp API timeout"));

    await expect(runIngestThenSweep(textMessagePayload)).resolves.toBeDefined();

    expect(eventLogCreate).toHaveBeenCalledTimes(1);
    expect(eventLogCreate.mock.calls[0][0].data).toMatchObject({
      level: "error",
      source: "whatsapp-send",
    });
    expect(messageUpdate).toHaveBeenCalledWith({
      where: { id: "msg_out_1" },
      data: { status: "failed" },
    });
  });
});
