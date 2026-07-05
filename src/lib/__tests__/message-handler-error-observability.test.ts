import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Business } from "@prisma/client";
import { textMessagePayload, TEST_PHONE_NUMBER_ID } from "./fixtures/webhook-payload";

const findFirstBusiness = vi.fn();
const findFirstMessage = vi.fn();
const conversationUpsert = vi.fn();
const messageCreate = vi.fn();
const messageFindMany = vi.fn();
const messageUpdate = vi.fn();
const eventLogCreate = vi.fn();

const conversationUpdate = vi.fn();

vi.mock("../db", () => ({
  prisma: {
    business: { findFirst: (...args: unknown[]) => findFirstBusiness(...args) },
    conversation: {
      upsert: (...args: unknown[]) => conversationUpsert(...args),
      update: (...args: unknown[]) => conversationUpdate(...args),
    },
    message: {
      create: (...args: unknown[]) => messageCreate(...args),
      findFirst: (...args: unknown[]) => findFirstMessage(...args),
      findMany: (...args: unknown[]) => messageFindMany(...args),
      update: (...args: unknown[]) => messageUpdate(...args),
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
}));

const sendBusinessMessage = vi.fn();
vi.mock("../whatsapp", () => ({
  sendBusinessMessage: (...args: unknown[]) => sendBusinessMessage(...args),
}));

const { processWebhookPayload } = await import("../message-handler");

const business: Business = {
  id: "biz_1",
  name: "Test Business",
  phoneNumberId: TEST_PHONE_NUMBER_ID,
  whatsappToken: "test-token",
  systemPrompt: "You are a helpful assistant for {businessName}.",
  welcomeMessage: "Welcome to {businessName}",
  businessInfo: {},
  model: "gpt-4o-mini",
  maxHistoryMessages: 20,
  isActive: true,
  ownerId: null,
  aiCredentialId: null,
  whatsappCredentialId: null,
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  findFirstBusiness.mockResolvedValue(business);
  findFirstMessage.mockResolvedValue(null);
  conversationUpsert.mockResolvedValue({
    id: "conv_1",
    businessId: business.id,
    customerPhone: "5215512345678",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  conversationUpdate.mockResolvedValue({});
  messageCreate.mockResolvedValue({ id: "msg_out_1" });
  messageFindMany.mockResolvedValue([]);
  messageUpdate.mockResolvedValue({});
  eventLogCreate.mockResolvedValue({});
  generateResponse.mockResolvedValue("Respuesta generada");
  sendBusinessMessage.mockResolvedValue(undefined);
});

describe("error observability", () => {
  it("logs an EventLog row and sends a Spanish fallback when the AI call fails", async () => {
    generateResponse.mockRejectedValue(new Error("OpenAI is down"));

    await processWebhookPayload(textMessagePayload);

    // User message is still persisted.
    expect(messageCreate.mock.calls[0][0].data).toMatchObject({ role: "user" });

    // Assistant message is the Spanish fallback, not silence.
    expect(messageCreate.mock.calls[1][0].data).toMatchObject({
      role: "assistant",
      content: "Lo siento, tuve un problema técnico. Intenta de nuevo en un momento.",
    });
    expect(sendBusinessMessage).toHaveBeenCalledWith(
      business,
      "5215512345678",
      "Lo siento, tuve un problema técnico. Intenta de nuevo en un momento."
    );

    expect(eventLogCreate).toHaveBeenCalledTimes(1);
    expect(eventLogCreate.mock.calls[0][0].data).toMatchObject({
      level: "error",
      source: "ai",
    });
  });

  it("logs an EventLog row when the WhatsApp send fails, without throwing", async () => {
    sendBusinessMessage.mockRejectedValue(new Error("WhatsApp API timeout"));

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
