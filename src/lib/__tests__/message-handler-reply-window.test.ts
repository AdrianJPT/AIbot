import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Business, PhoneNumber } from "@prisma/client";
import {
  documentMessagePayload,
  textMessagePayload,
  TEST_PHONE_NUMBER_ID,
} from "./fixtures/webhook-payload";

const findFirstPhoneNumber = vi.fn();
const findFirstMessage = vi.fn();
const conversationUpsert = vi.fn();
const conversationUpdate = vi.fn();
const messageCreate = vi.fn();
const messageFindMany = vi.fn();
const messageUpdate = vi.fn();
const messageCount = vi.fn();

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

const callWithAiCredential = vi.fn((_business: unknown, fn: (client: unknown) => unknown) =>
  fn({ marker: "fake-ai-client" })
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

vi.mock("../media", () => ({
  downloadMediaBuffer: vi.fn(),
  describeImageFromBuffer: vi.fn(),
  transcribeAudioBuffer: vi.fn(),
}));

const { processWebhookPayload } = await import("../message-handler");

const baseBusiness: Business = {
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
  replyWindowMs: 30_000,
  dailyAiLimit: 1000,
  isActive: true,
  ownerId: "owner_1",
  aiCredentialId: null,
  createdAt: new Date(),
};

const phoneNumber: PhoneNumber = {
  id: "phone_1",
  businessId: baseBusiness.id,
  phoneNumberId: TEST_PHONE_NUMBER_ID,
  displayPhone: null,
  whatsappCredentialId: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  findFirstMessage.mockResolvedValue(null);
  conversationUpsert.mockResolvedValue({
    id: "conv_1",
    businessId: baseBusiness.id,
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
  sendFromNumber.mockResolvedValue("wamid.OUTBOUND_001");
});

describe("reply window (Business.replyWindowMs)", () => {
  it("sets pendingFlushAt and skips the AI call / reply when replyWindowMs > 0", async () => {
    findFirstPhoneNumber.mockResolvedValue({ ...phoneNumber, business: baseBusiness });

    await processWebhookPayload(textMessagePayload);

    expect(generateResponse).not.toHaveBeenCalled();
    expect(sendFromNumber).not.toHaveBeenCalled();
    // Only the customer message persisted, not a bot reply.
    expect(messageCreate).toHaveBeenCalledTimes(1);

    const pendingUpdateCall = conversationUpdate.mock.calls.find(
      (call) => call[0]?.data?.pendingFlushAt instanceof Date
    );
    expect(pendingUpdateCall).toBeTruthy();
    expect(pendingUpdateCall![0]).toMatchObject({ where: { id: "conv_1" } });
    expect(pendingUpdateCall![0].data.pendingFlushAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("does not batch document messages even when replyWindowMs > 0 — keeps the immediate canned reply", async () => {
    findFirstPhoneNumber.mockResolvedValue({ ...phoneNumber, business: baseBusiness });

    await processWebhookPayload(documentMessagePayload);

    expect(generateResponse).not.toHaveBeenCalled();
    expect(sendFromNumber).toHaveBeenCalledTimes(1);
    expect(messageCreate.mock.calls[1][0].data.content).toContain("no puedo leer archivos");

    const pendingUpdateCall = conversationUpdate.mock.calls.find(
      (call) => call[0]?.data?.pendingFlushAt instanceof Date
    );
    expect(pendingUpdateCall).toBeFalsy();
  });

  it("does not batch when the conversation is rate-limited — rate limiting stays a hard stop", async () => {
    messageCount.mockResolvedValue(11);
    findFirstPhoneNumber.mockResolvedValue({ ...phoneNumber, business: baseBusiness });

    await processWebhookPayload(textMessagePayload);

    expect(generateResponse).not.toHaveBeenCalled();
    expect(sendFromNumber).not.toHaveBeenCalled();

    const pendingUpdateCall = conversationUpdate.mock.calls.find(
      (call) => call[0]?.data?.pendingFlushAt instanceof Date
    );
    expect(pendingUpdateCall).toBeFalsy();
  });

  it("replies immediately, with no pendingFlushAt update, when replyWindowMs is 0 (default/backward-compatible)", async () => {
    findFirstPhoneNumber.mockResolvedValue({
      ...phoneNumber,
      business: { ...baseBusiness, replyWindowMs: 0 },
    });

    await processWebhookPayload(textMessagePayload);

    expect(generateResponse).toHaveBeenCalledTimes(1);
    expect(sendFromNumber).toHaveBeenCalledTimes(1);

    const pendingUpdateCall = conversationUpdate.mock.calls.find(
      (call) => call[0]?.data?.pendingFlushAt instanceof Date
    );
    expect(pendingUpdateCall).toBeFalsy();
  });
});
