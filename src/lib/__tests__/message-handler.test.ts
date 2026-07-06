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
const conversationUpdate = vi.fn();
const messageCreate = vi.fn();
const messageFindMany = vi.fn();
const messageUpdate = vi.fn();
const messageCount = vi.fn();

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
      count: (...args: unknown[]) => messageCount(...args),
    },
    // The real Prisma `$transaction([...])` accepts an array of already
    // in-flight query promises and awaits them together. Since every model
    // method above is mocked to return a resolved value synchronously, the
    // same behavior is reproduced here without a real transaction.
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
  dailyAiLimit: 1000,
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
  messageCount.mockResolvedValue(0);
  generateResponse.mockResolvedValue("Respuesta generada");
  sendBusinessMessage.mockResolvedValue("wamid.OUTBOUND_001");
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

  it("handles delivery status update payloads: updates the matching Message by wamid, no new message/conversation created", async () => {
    findFirstMessage.mockResolvedValue({ id: "msg_out_1", wamid: "wamid.TEXT_MESSAGE_ID_001" });

    await processWebhookPayload(statusUpdatePayload);

    expect(messageCreate).not.toHaveBeenCalled();
    expect(conversationUpsert).not.toHaveBeenCalled();
    expect(findFirstMessage).toHaveBeenCalledWith({
      where: { wamid: "wamid.TEXT_MESSAGE_ID_001" },
    });
    expect(messageUpdate).toHaveBeenCalledWith({
      where: { id: "msg_out_1" },
      data: { status: "delivered" },
    });
  });

  it("does nothing when a status update references an unknown wamid", async () => {
    findFirstMessage.mockResolvedValue(null);

    await processWebhookPayload(statusUpdatePayload);

    expect(messageUpdate).not.toHaveBeenCalled();
  });

  it("captures the outbound wamid returned by sendBusinessMessage on the bot reply", async () => {
    await processWebhookPayload(textMessagePayload);

    expect(messageUpdate).toHaveBeenCalledWith({
      where: { id: "msg_out_1" },
      data: { wamid: "wamid.OUTBOUND_001" },
    });
  });

  it("bumps lastMessageAt, unreadCount and customerName on the customer message, and lastMessageAt again on the bot reply", async () => {
    await processWebhookPayload(textMessagePayload);

    // First conversation.update call: alongside the customer message insert.
    expect(conversationUpdate).toHaveBeenCalledTimes(2);
    expect(conversationUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: "conv_1" },
      data: {
        unreadCount: { increment: 1 },
        customerName: "Cliente de Prueba",
      },
    });
    expect(conversationUpdate.mock.calls[0][0].data.lastMessageAt).toBeInstanceOf(
      Date
    );

    // Second conversation.update call: alongside the bot reply insert, no
    // unreadCount/customerName touch.
    expect(conversationUpdate.mock.calls[1][0].data).not.toHaveProperty(
      "unreadCount"
    );
    expect(conversationUpdate.mock.calls[1][0].data).not.toHaveProperty(
      "customerName"
    );
    expect(conversationUpdate.mock.calls[1][0].data.lastMessageAt).toBeInstanceOf(
      Date
    );
  });

  it("marks the customer message as sentBy:customer and the bot reply as sentBy:bot", async () => {
    await processWebhookPayload(textMessagePayload);

    expect(messageCreate.mock.calls[0][0].data).toMatchObject({
      role: "user",
      sentBy: "customer",
    });
    expect(messageCreate.mock.calls[1][0].data).toMatchObject({
      role: "assistant",
      sentBy: "bot",
    });
  });

  it("still persists the customer message and bumps unreadCount when handed_off, without calling the AI or sending a reply", async () => {
    conversationUpsert.mockResolvedValueOnce({
      id: "conv_1",
      businessId: business.id,
      customerPhone: "5215512345678",
      status: "handed_off",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await processWebhookPayload(textMessagePayload);

    expect(generateResponse).not.toHaveBeenCalled();
    expect(sendBusinessMessage).not.toHaveBeenCalled();
    expect(messageCreate).toHaveBeenCalledTimes(1);
    expect(messageCreate.mock.calls[0][0].data).toMatchObject({
      sentBy: "customer",
    });
    expect(conversationUpdate).toHaveBeenCalledTimes(1);
    expect(conversationUpdate.mock.calls[0][0].data).toMatchObject({
      unreadCount: { increment: 1 },
      customerName: "Cliente de Prueba",
    });
  });
});
