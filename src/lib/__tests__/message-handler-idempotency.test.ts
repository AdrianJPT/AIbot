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
  ownerId: null,
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
  generateResponse.mockResolvedValue("Respuesta generada");
  resolveWhatsappToken.mockResolvedValue("test-token");
  sendFromNumber.mockResolvedValue(undefined);
});

describe("webhook idempotency (dedupe retries)", () => {
  it("replaying the same wamid creates exactly one user + one assistant message", async () => {
    // First delivery: no existing message with this wamid yet.
    findFirstMessage.mockResolvedValueOnce(null);
    await processWebhookPayload(textMessagePayload);
    expect(messageCreate).toHaveBeenCalledTimes(2);
    expect(messageCreate.mock.calls[0][0].data).toMatchObject({
      wamid: "wamid.TEXT_MESSAGE_ID_001",
    });

    // Meta retries the same webhook: pre-check now finds the persisted wamid.
    findFirstMessage.mockResolvedValueOnce({
      id: "msg_1",
      wamid: "wamid.TEXT_MESSAGE_ID_001",
    });
    await processWebhookPayload(textMessagePayload);

    // No additional messages created and no duplicate reply sent.
    expect(messageCreate).toHaveBeenCalledTimes(2);
    expect(sendFromNumber).toHaveBeenCalledTimes(1);
  });
});
