import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Business, PhoneNumber } from "@prisma/client";
import { textMessagePayload, TEST_PHONE_NUMBER_ID } from "./fixtures/webhook-payload";

const findFirstPhoneNumber = vi.fn();
const findFirstMessage = vi.fn();
const conversationUpsert = vi.fn();
const conversationUpdate = vi.fn();
const messageCreate = vi.fn();
const messageFindMany = vi.fn();
const messageUpdate = vi.fn();
const messageCount = vi.fn();
const eventLogCreate = vi.fn();

vi.mock("../db", () => ({
  prisma: {
    phoneNumber: { findFirst: (...args: unknown[]) => findFirstPhoneNumber(...args) },
    conversation: {
      upsert: (...args: unknown[]) => conversationUpsert(...args),
      update: (...args: unknown[]) => conversationUpdate(...args),
    },
    message: {
      create: (...args: unknown[]) => messageCreate(...args),
      findFirst: (...args: unknown[]) => findFirstMessage(...args),
      findMany: (...args: unknown[]) => messageFindMany(...args),
      update: (...args: unknown[]) => messageUpdate(...args),
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
const callWithFailover = vi.fn((_business: unknown, fn: (client: unknown) => unknown) =>
  fn(fakeAiClient)
);
vi.mock("../ai/resolve", () => ({
  callWithFailover: (...args: Parameters<typeof callWithFailover>) =>
    callWithFailover(...args),
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

const business: Business = {
  id: "biz_1",
  name: "Test Business",
  wabaId: null,
  systemPrompt: "You are a helpful assistant for {businessName}.",
  welcomeMessage: "Welcome to {businessName}",
  businessInfo: {},
  model: "gpt-4o-mini",
  visionModel: "gpt-4o-mini",
  audioModel: "whisper-1",
  maxHistoryMessages: 20,
  dailyAiLimit: 1000,
  isActive: true,
  ownerId: "owner_1",
  aiCredentialId: null,
  createdAt: new Date(),
};

const phoneNumber: PhoneNumber = {
  id: "phone_1",
  businessId: business.id,
  phoneNumberId: TEST_PHONE_NUMBER_ID,
  displayPhone: null,
  whatsappCredentialId: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** Distinguishes the two `message.count` call sites by their `where` shape. */
function isCustomerRateLimitQuery(args: unknown[]): boolean {
  const where = (args[0] as { where?: Record<string, unknown> })?.where;
  return where?.sentBy === "customer";
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
  messageCreate.mockResolvedValue({ id: "msg_out_1" });
  messageFindMany.mockResolvedValue([]);
  messageUpdate.mockResolvedValue({});
  messageCount.mockResolvedValue(0);
  eventLogCreate.mockResolvedValue({});
  generateResponse.mockResolvedValue("Respuesta generada");
  resolveWhatsappToken.mockResolvedValue("test-token");
  sendFromNumber.mockResolvedValue(undefined);
});

describe("per-conversation rate limiting", () => {
  it("persists the message but skips AI generation once the 60s threshold is exceeded", async () => {
    messageCount.mockImplementation((...args: unknown[]) =>
      Promise.resolve(isCustomerRateLimitQuery(args) ? 11 : 0)
    );

    await processWebhookPayload(textMessagePayload);

    // Customer message is still persisted.
    expect(messageCreate).toHaveBeenCalledTimes(1);
    expect(messageCreate.mock.calls[0][0].data).toMatchObject({ sentBy: "customer" });

    // No AI call, no reply sent, and a warn logged.
    expect(generateResponse).not.toHaveBeenCalled();
    expect(sendFromNumber).not.toHaveBeenCalled();
    expect(eventLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ level: "warn", source: "webhook" }),
      })
    );
  });

  it("calls the AI normally when under the threshold", async () => {
    messageCount.mockImplementation((...args: unknown[]) =>
      Promise.resolve(isCustomerRateLimitQuery(args) ? 3 : 0)
    );

    await processWebhookPayload(textMessagePayload);

    expect(generateResponse).toHaveBeenCalledTimes(1);
    expect(sendFromNumber).toHaveBeenCalledTimes(1);
  });
});

describe("per-business daily AI budget", () => {
  it("sends the fallback message instead of calling the AI once the daily budget is exhausted", async () => {
    messageCount.mockImplementation((...args: unknown[]) =>
      Promise.resolve(isCustomerRateLimitQuery(args) ? 0 : 1000)
    );
    findFirstMessage.mockImplementation((args: { where: Record<string, unknown> }) => {
      // Dedup-by-wamid pre-check (keyed only by `wamid`) vs the
      // already-notified-today lookup (keyed by content too).
      if ("content" in args.where) return Promise.resolve(null);
      return Promise.resolve(null);
    });

    await processWebhookPayload(textMessagePayload);

    expect(generateResponse).not.toHaveBeenCalled();
    expect(messageCreate.mock.calls[1][0].data).toMatchObject({
      role: "assistant",
      content: "Estamos recibiendo muchos mensajes, en breve te responderemos.",
    });
    expect(sendFromNumber).toHaveBeenCalledWith(
      expect.objectContaining({ id: phoneNumber.id }),
      business.ownerId,
      "5215512345678",
      "Estamos recibiendo muchos mensajes, en breve te responderemos."
    );
    expect(eventLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ level: "warn", source: "ai" }),
      })
    );
  });

  it("stays silent (no reply) if the daily budget notice was already sent today", async () => {
    messageCount.mockImplementation((...args: unknown[]) =>
      Promise.resolve(isCustomerRateLimitQuery(args) ? 0 : 1000)
    );
    findFirstMessage.mockImplementation((args: { where: Record<string, unknown> }) => {
      if ("content" in args.where) {
        return Promise.resolve({ id: "msg_notice", wamid: null });
      }
      return Promise.resolve(null);
    });

    await processWebhookPayload(textMessagePayload);

    expect(generateResponse).not.toHaveBeenCalled();
    expect(sendFromNumber).not.toHaveBeenCalled();
    // Only the customer message is persisted — no assistant reply.
    expect(messageCreate).toHaveBeenCalledTimes(1);
  });
});
