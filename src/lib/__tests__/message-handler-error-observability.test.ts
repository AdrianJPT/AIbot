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

type LoggedRow = {
  level: string;
  source: string;
  message: string;
  detail?: Record<string, unknown>;
  businessId?: string;
};

/** The EventLog rows logEvent persisted during this test, in order. */
function loggedRows(): LoggedRow[] {
  return eventLogCreate.mock.calls.map((call) => call[0].data as LoggedRow);
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
  generateResponse.mockResolvedValue(buildAiReply());
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

    // Asserted by source rather than by call count: the AI call succeeded on
    // this path, so it also logged its token usage, and this test is about the
    // send failure. Coupling it to a total would make every future log a
    // failure here.
    const sendFailures = loggedRows().filter(
      (row) => row.source === "whatsapp-send",
    );
    expect(sendFailures).toHaveLength(1);
    expect(sendFailures[0]).toMatchObject({ level: "error" });
    expect(messageUpdate).toHaveBeenCalledWith({
      where: { id: "msg_out_1" },
      data: { status: "failed" },
    });
  });
});

/**
 * Token accounting is the whole point of these: before it existed
 * `generateResponse` received the provider's `usage` block and dropped it, so
 * there was no way to answer what a conversation actually costs. The mapping
 * from the provider's snake_case shape into `AiUsage` is covered separately in
 * ai-usage.test.ts — here `generateResponse` is mocked, so what is under test is
 * that `resolveAiReply` persists what it was handed.
 */
describe("AI token-usage logging", () => {
  it("logs an ai-usage row with the normalized token counts and the model", async () => {
    generateResponse.mockResolvedValue(
      buildAiReply({
        usage: {
          promptTokens: 812,
          completionTokens: 64,
          totalTokens: 876,
          cachedPromptTokens: 768,
        },
      }),
    );

    await runIngestThenSweep(textMessagePayload);

    const usageRows = loggedRows().filter((row) => row.source === "ai-usage");
    expect(usageRows).toHaveLength(1);
    expect(usageRows[0]).toMatchObject({
      level: "info",
      source: "ai-usage",
      message: "AI call token usage",
      businessId: business.id,
      detail: {
        conversationId: "conv_1",
        model: "gpt-4o-mini",
        promptTokens: 812,
        completionTokens: 64,
        totalTokens: 876,
        // The number that answers "is the stable prefix being cached at all?"
        cachedPromptTokens: 768,
      },
    });
  });

  it("still logs, and says so, when the provider returns no usage block", async () => {
    generateResponse.mockResolvedValue(buildAiReply({ usage: null }));

    await runIngestThenSweep(textMessagePayload);

    const usageRows = loggedRows().filter((row) => row.source === "ai-usage");
    expect(usageRows).toHaveLength(1);
    expect(usageRows[0]).toMatchObject({
      level: "info",
      message: "AI call returned no usage block",
      detail: { conversationId: "conv_1", model: "gpt-4o-mini" },
    });
    // Silence about cost is itself worth seeing, so no token fields are faked.
    expect(usageRows[0].detail).not.toHaveProperty("totalTokens");
  });

  it("does not log usage when the AI call failed", async () => {
    generateResponse.mockRejectedValue(new Error("OpenAI is down"));

    await runIngestThenSweep(textMessagePayload);

    expect(loggedRows().filter((row) => row.source === "ai-usage")).toEqual([]);
  });

  it("does not log usage when the daily budget short-circuits the AI call", async () => {
    // dailyAiLimit reached: resolveAiReply returns the canned notice without
    // ever reaching the provider, so there is no usage to record.
    messageCount.mockResolvedValue(business.dailyAiLimit);
    findFirstMessage.mockResolvedValue(null);

    await runIngestThenSweep(textMessagePayload);

    expect(generateResponse).not.toHaveBeenCalled();
    expect(loggedRows().filter((row) => row.source === "ai-usage")).toEqual([]);
  });
});
