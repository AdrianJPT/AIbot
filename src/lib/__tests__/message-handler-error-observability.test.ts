import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Business, PhoneNumber } from "@prisma/client";
import { textMessagePayload, TEST_PHONE_NUMBER_ID } from "./fixtures/webhook-payload";

const findFirstPhoneNumber = vi.fn();
const findFirstMessage = vi.fn();
const conversationUpsert = vi.fn();
const messageCreate = vi.fn();
const messageFindMany = vi.fn();
const messageUpdate = vi.fn();
const messageCount = vi.fn();
const eventLogCreate = vi.fn();

const conversationUpdate = vi.fn();

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
const callWithAiCredential = vi.fn((_business: unknown, fn: (client: unknown) => unknown) =>
  fn(fakeAiClient)
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
  replyWindowMs: 0,
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

describe("error observability", () => {
  it("logs an EventLog row and stays silent toward the customer when the AI call fails", async () => {
    generateResponse.mockRejectedValue(new Error("OpenAI is down"));

    await processWebhookPayload(textMessagePayload);

    // User message is still persisted.
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
  });

  it("logs an EventLog row when the WhatsApp send fails, without throwing", async () => {
    sendFromNumber.mockRejectedValue(new Error("WhatsApp API timeout"));

    await expect(processWebhookPayload(textMessagePayload)).resolves.toBeUndefined();

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
