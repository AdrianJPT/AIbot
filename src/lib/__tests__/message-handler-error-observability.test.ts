import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Business } from "@prisma/client";
import { textMessagePayload, TEST_PHONE_NUMBER_ID } from "./fixtures/webhook-payload";

const findFirstBusiness = vi.fn();
const findFirstMessage = vi.fn();
const conversationUpsert = vi.fn();
const messageCreate = vi.fn();
const messageFindMany = vi.fn();
const eventLogCreate = vi.fn();

vi.mock("../db", () => ({
  prisma: {
    business: { findFirst: (...args: unknown[]) => findFirstBusiness(...args) },
    conversation: { upsert: (...args: unknown[]) => conversationUpsert(...args) },
    message: {
      create: (...args: unknown[]) => messageCreate(...args),
      findFirst: (...args: unknown[]) => findFirstMessage(...args),
      findMany: (...args: unknown[]) => messageFindMany(...args),
    },
    eventLog: { create: (...args: unknown[]) => eventLogCreate(...args) },
  },
}));

const generateResponse = vi.fn();
vi.mock("../openai", () => ({
  generateResponse: (...args: unknown[]) => generateResponse(...args),
}));

const sendMessage = vi.fn();
vi.mock("../whatsapp", () => ({
  sendMessage: (...args: unknown[]) => sendMessage(...args),
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
  messageCreate.mockResolvedValue({});
  messageFindMany.mockResolvedValue([]);
  eventLogCreate.mockResolvedValue({});
  generateResponse.mockResolvedValue("Respuesta generada");
  sendMessage.mockResolvedValue(undefined);
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
    expect(sendMessage).toHaveBeenCalledWith(
      business.phoneNumberId,
      business.whatsappToken,
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
    sendMessage.mockRejectedValue(new Error("WhatsApp API timeout"));

    await expect(processWebhookPayload(textMessagePayload)).resolves.toBeUndefined();

    expect(eventLogCreate).toHaveBeenCalledTimes(1);
    expect(eventLogCreate.mock.calls[0][0].data).toMatchObject({
      level: "error",
      source: "whatsapp-send",
    });
  });
});
