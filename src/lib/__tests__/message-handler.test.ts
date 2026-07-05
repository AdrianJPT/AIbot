import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Business } from "@prisma/client";
import {
  audioMessagePayload,
  documentMessagePayload,
  imageMessagePayload,
  interactiveMessagePayload,
  locationMessagePayload,
  statusUpdatePayload,
  textMessagePayload,
  TEST_PHONE_NUMBER_ID,
} from "./fixtures/webhook-payload";

const findFirstBusiness = vi.fn();
const findFirstMessage = vi.fn();
const conversationUpsert = vi.fn();
const messageCreate = vi.fn();
const messageFindMany = vi.fn();

vi.mock("../db", () => ({
  prisma: {
    business: { findFirst: (...args: unknown[]) => findFirstBusiness(...args) },
    conversation: { upsert: (...args: unknown[]) => conversationUpsert(...args) },
    message: {
      create: (...args: unknown[]) => messageCreate(...args),
      findFirst: (...args: unknown[]) => findFirstMessage(...args),
      findMany: (...args: unknown[]) => messageFindMany(...args),
    },
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

const downloadMediaBuffer = vi.fn();
const describeImageFromBuffer = vi.fn();
const transcribeAudioBuffer = vi.fn();
vi.mock("../media", () => ({
  downloadMediaBuffer: (...args: unknown[]) => downloadMediaBuffer(...args),
  describeImageFromBuffer: (...args: unknown[]) => describeImageFromBuffer(...args),
  transcribeAudioBuffer: (...args: unknown[]) => transcribeAudioBuffer(...args),
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
  messageCreate.mockResolvedValue({});
  messageFindMany.mockResolvedValue([]);
  generateResponse.mockResolvedValue("Respuesta generada");
  sendBusinessMessage.mockResolvedValue(undefined);
});

describe("processWebhookPayload", () => {
  it("handles text messages: persists user + assistant message and sends reply", async () => {
    await processWebhookPayload(textMessagePayload);

    expect(messageCreate).toHaveBeenCalledTimes(2);
    expect(messageCreate.mock.calls[0][0].data).toMatchObject({
      role: "user",
      mediaType: "text",
      content: "Hola, quiero hacer una reserva",
    });
    expect(messageCreate.mock.calls[1][0].data).toMatchObject({
      role: "assistant",
      mediaType: "text",
      content: "Respuesta generada",
    });
    expect(sendBusinessMessage).toHaveBeenCalledWith(
      business,
      "5215512345678",
      "Respuesta generada"
    );
  });

  it("handles image messages: downloads media and describes it", async () => {
    downloadMediaBuffer.mockResolvedValue({
      buffer: Buffer.from("fake-image"),
      mimeType: "image/jpeg",
    });
    describeImageFromBuffer.mockResolvedValue("Una foto de un plato de comida");

    await processWebhookPayload(imageMessagePayload);

    expect(downloadMediaBuffer).toHaveBeenCalledWith(
      "MEDIA_ID_IMAGE_001",
      business.whatsappToken
    );
    expect(messageCreate.mock.calls[0][0].data).toMatchObject({
      mediaType: "image",
      content: "[Imagen del cliente] Una foto de un plato de comida",
    });
  });

  it("handles audio messages: downloads media and transcribes it", async () => {
    downloadMediaBuffer.mockResolvedValue({
      buffer: Buffer.from("fake-audio"),
      mimeType: "audio/ogg",
    });
    transcribeAudioBuffer.mockResolvedValue("Quiero cancelar mi cita");

    await processWebhookPayload(audioMessagePayload);

    expect(transcribeAudioBuffer).toHaveBeenCalled();
    expect(messageCreate.mock.calls[0][0].data).toMatchObject({
      mediaType: "audio",
      content: "[Audio del cliente] Quiero cancelar mi cita",
    });
  });

  it("handles location messages", async () => {
    await processWebhookPayload(locationMessagePayload);

    expect(messageCreate.mock.calls[0][0].data).toMatchObject({
      mediaType: "location",
    });
    expect(messageCreate.mock.calls[0][0].data.content).toContain("19.432608");
  });

  it("handles interactive (list_reply) messages", async () => {
    await processWebhookPayload(interactiveMessagePayload);

    expect(messageCreate.mock.calls[0][0].data).toMatchObject({
      mediaType: "text",
      content: "Reservar mesa",
    });
  });

  it("handles document messages with a static fallback and skips the AI call", async () => {
    await processWebhookPayload(documentMessagePayload);

    expect(generateResponse).not.toHaveBeenCalled();
    expect(messageCreate.mock.calls[1][0].data.content).toContain(
      "no puedo leer archivos"
    );
  });

  it("ignores delivery status update payloads (no messages[])", async () => {
    await processWebhookPayload(statusUpdatePayload);

    expect(messageCreate).not.toHaveBeenCalled();
    expect(conversationUpsert).not.toHaveBeenCalled();
  });
});
