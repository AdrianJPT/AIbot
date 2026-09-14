import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildBusiness, buildPhoneNumber } from "./fixtures/business";
import { buildAiReply } from "./fixtures/ai-reply";
import {
  audioMessagePayload,
  documentMessagePayload,
  imageMessagePayload,
  interactiveMessagePayload,
  locationMessagePayload,
  statusUpdatePayload,
  textMessagePayload,
} from "./fixtures/webhook-payload";
import type {
  ChannelConnection,
  DeliveryStatus,
  IgnoredEvent,
  InboundMessage,
} from "../channels/contracts";

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
    phoneNumber: {
      findFirst: (...args: unknown[]) => findFirstPhoneNumber(...args),
    },
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

const downloadMediaBuffer = vi.fn();
const describeImageFromBuffer = vi.fn();
const transcribeAudioBuffer = vi.fn();
vi.mock("../media", () => ({
  downloadMediaBuffer: (...args: unknown[]) => downloadMediaBuffer(...args),
  describeImageFromBuffer: (...args: unknown[]) =>
    describeImageFromBuffer(...args),
  transcribeAudioBuffer: (...args: unknown[]) => transcribeAudioBuffer(...args),
}));

const { processNormalizedEvents, processWebhookPayload } =
  await import("../message-handler");

const business = buildBusiness();

const phoneNumber = buildPhoneNumber();

const TEST_TOKEN = "test-token";

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
  generateResponse.mockResolvedValue(buildAiReply());
  resolveWhatsappToken.mockResolvedValue(TEST_TOKEN);
  sendFromNumber.mockResolvedValue("wamid.OUTBOUND_001");
});

/**
 * `processWebhookPayload` is ingest-only now — it never calls the AI or
 * sends a reply (that's the reply-window scheduler's job, see
 * reply-window-scheduler.test.ts and dispatch-resumability.test.ts for those
 * assertions). These tests cover exactly what ingest is responsible for:
 * dedupe, content parsing per message type, persistence, and marking the
 * conversation due for dispatch.
 */
describe("processWebhookPayload (ingest)", () => {
  it("handles text messages: persists the user message and marks the conversation due", async () => {
    const touched = await processWebhookPayload(textMessagePayload);

    expect(touched).toEqual(["conv_1"]);
    expect(messageCreate).toHaveBeenCalledTimes(1);
    expect(messageCreate.mock.calls[0][0].data).toMatchObject({
      role: "user",
      mediaType: "text",
      content: "Hola, quiero hacer una reserva",
    });
    expect(generateResponse).not.toHaveBeenCalled();
    expect(sendFromNumber).not.toHaveBeenCalled();

    const pendingUpdateCall = conversationUpdate.mock.calls.find(
      (call) => call[0]?.data?.pendingFlushAt instanceof Date,
    );
    expect(pendingUpdateCall).toBeTruthy();
    expect(pendingUpdateCall![0]).toMatchObject({ where: { id: "conv_1" } });
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
      TEST_TOKEN,
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

  it("still persists a fallback and marks the conversation due when transcribeAudioBuffer throws, instead of losing the message entirely", async () => {
    downloadMediaBuffer.mockResolvedValue({
      buffer: Buffer.from("fake-audio"),
      mimeType: "audio/ogg",
    });
    transcribeAudioBuffer.mockRejectedValue(new Error("404 no such endpoint"));

    const touched = await processWebhookPayload(audioMessagePayload);

    expect(messageCreate.mock.calls[0][0].data).toMatchObject({
      mediaType: "audio",
      content: "[Audio del cliente — no se pudo transcribir]",
    });
    // The pipeline still runs to completion and marks the conversation due
    // for dispatch — the customer never ends up with total silence just
    // because transcription failed; the sweep still owes them a reply.
    expect(touched).toEqual(["conv_1"]);
  });

  it("still persists a fallback and marks the conversation due when describeImageFromBuffer throws, instead of losing the message entirely", async () => {
    downloadMediaBuffer.mockResolvedValue({
      buffer: Buffer.from("fake-image"),
      mimeType: "image/jpeg",
    });
    describeImageFromBuffer.mockRejectedValue(
      new Error("invalid model for provider"),
    );

    const touched = await processWebhookPayload(imageMessagePayload);

    expect(messageCreate.mock.calls[0][0].data).toMatchObject({
      mediaType: "image",
      content: "[Imagen del cliente — no se pudo procesar]",
    });
    expect(touched).toEqual(["conv_1"]);
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

  it("handles document messages: persists as-is and marks due — the canned fallback now comes from the sweep, not ingest", async () => {
    const touched = await processWebhookPayload(documentMessagePayload);

    expect(messageCreate).toHaveBeenCalledTimes(1);
    expect(messageCreate.mock.calls[0][0].data).toMatchObject({
      mediaType: "document",
      content: "[Documento adjunto]",
    });
    expect(generateResponse).not.toHaveBeenCalled();
    expect(sendFromNumber).not.toHaveBeenCalled();
    expect(touched).toEqual(["conv_1"]);
  });

  it("handles delivery status update payloads: updates the matching Message by wamid, no new message/conversation created", async () => {
    findFirstMessage.mockResolvedValue({
      id: "msg_out_1",
      wamid: "wamid.TEXT_MESSAGE_ID_001",
    });

    const touched = await processWebhookPayload(statusUpdatePayload);

    expect(touched).toEqual([]);
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

  it("bumps lastMessageAt, unreadCount and customerName on the customer message, and marks the conversation due", async () => {
    await processWebhookPayload(textMessagePayload);

    // First conversation.update call: alongside the customer message insert
    // (persistCustomerMessage's transaction).
    expect(conversationUpdate).toHaveBeenCalledTimes(2);
    expect(conversationUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: "conv_1" },
      data: {
        unreadCount: { increment: 1 },
        customerName: "Cliente de Prueba",
      },
    });
    expect(
      conversationUpdate.mock.calls[0][0].data.lastMessageAt,
    ).toBeInstanceOf(Date);

    // Second conversation.update call: the explicit due-marker, no
    // unreadCount/customerName touch.
    expect(conversationUpdate.mock.calls[1][0].data).toMatchObject({
      pendingFlushAt: expect.any(Date),
    });
    expect(conversationUpdate.mock.calls[1][0].data).not.toHaveProperty(
      "unreadCount",
    );
    expect(conversationUpdate.mock.calls[1][0].data).not.toHaveProperty(
      "customerName",
    );
  });

  it("marks the customer message as sentBy:customer", async () => {
    await processWebhookPayload(textMessagePayload);

    expect(messageCreate.mock.calls[0][0].data).toMatchObject({
      role: "user",
      sentBy: "customer",
    });
  });

  it("still persists the customer message and bumps unreadCount when handed_off, without marking the conversation due or touching the AI/send path", async () => {
    conversationUpsert.mockResolvedValueOnce({
      id: "conv_1",
      businessId: business.id,
      customerPhone: "5215512345678",
      status: "handed_off",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const touched = await processWebhookPayload(textMessagePayload);

    expect(touched).toEqual(["conv_1"]);
    expect(generateResponse).not.toHaveBeenCalled();
    expect(sendFromNumber).not.toHaveBeenCalled();
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

/**
 * `processNormalizedEvents` is the registry-driven entry point drain.ts now
 * calls directly (see src/lib/outbox/drain.ts) — `processWebhookPayload`
 * above is a thin legacy wrapper around this same function (it decodes a raw
 * payload through the real WhatsApp adapter first), so every content/status
 * parity scenario is already proven by the suite above. These tests cover
 * only what's reachable exclusively at this layer: ignored events, the new
 * senderDisplayName/quotedMessageId metadata mapping, and the connection-
 * level fail-closed gate (`resolveBusinessContext`).
 */
describe("processNormalizedEvents (ingest, registry-driven layer)", () => {
  const connection: ChannelConnection = {
    id: "conn_1",
    businessId: business.id,
    channel: "whatsapp",
    provider: "meta",
    externalId: phoneNumber.phoneNumberId,
    isActive: true,
  };

  function textEvent(overrides: Partial<InboundMessage> = {}): InboundMessage {
    return {
      kind: "message",
      channel: "whatsapp",
      tenantId: business.id,
      connectionId: connection.id,
      eventId: "wamid.TEXT_MESSAGE_ID_001",
      from: "5215512345678",
      content: { kind: "text", text: "Hola, quiero hacer una reserva" },
      ...overrides,
    };
  }

  it("does nothing for an ignored event — no persistence, nothing touched", async () => {
    const ignored: IgnoredEvent = {
      kind: "ignored",
      channel: "whatsapp",
      tenantId: business.id,
      connectionId: connection.id,
      eventId: "unknown",
      reason: "unsupported_message",
    };

    const touched = await processNormalizedEvents(connection, [ignored]);

    expect(touched).toEqual([]);
    expect(messageCreate).not.toHaveBeenCalled();
    expect(conversationUpsert).not.toHaveBeenCalled();
  });

  it("updates Conversation.customerName from senderDisplayName, and omits it when absent", async () => {
    await processNormalizedEvents(connection, [
      textEvent({ senderDisplayName: "Ana López" }),
    ]);
    expect(conversationUpdate.mock.calls[0][0].data).toMatchObject({
      customerName: "Ana López",
    });

    vi.clearAllMocks();
    findFirstPhoneNumber.mockResolvedValue({ ...phoneNumber, business });
    conversationUpsert.mockResolvedValue({
      id: "conv_1",
      businessId: business.id,
      customerPhone: "5215512345678",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    messageCreate.mockResolvedValue({ id: "msg_out_1" });

    await processNormalizedEvents(connection, [textEvent()]);
    expect(conversationUpdate.mock.calls[0][0].data).not.toHaveProperty(
      "customerName",
    );
  });

  it("persists Message.quotedWamid from quotedMessageId, and leaves it undefined when absent", async () => {
    await processNormalizedEvents(connection, [
      textEvent({ quotedMessageId: "wamid.PREVIOUS_001" }),
    ]);
    expect(messageCreate.mock.calls[0][0].data).toMatchObject({
      quotedWamid: "wamid.PREVIOUS_001",
    });

    vi.clearAllMocks();
    findFirstPhoneNumber.mockResolvedValue({ ...phoneNumber, business });
    conversationUpsert.mockResolvedValue({
      id: "conv_1",
      businessId: business.id,
      customerPhone: "5215512345678",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    messageCreate.mockResolvedValue({ id: "msg_out_1" });

    await processNormalizedEvents(connection, [textEvent()]);
    expect(messageCreate.mock.calls[0][0].data.quotedWamid).toBeUndefined();
  });

  it("fails closed with zero domain dispatch when the connection's phone number cannot be resolved (foreign/inactive/missing)", async () => {
    findFirstPhoneNumber.mockResolvedValue(null);

    const touched = await processNormalizedEvents(connection, [textEvent()]);

    expect(touched).toEqual([]);
    expect(messageCreate).not.toHaveBeenCalled();
    expect(conversationUpsert).not.toHaveBeenCalled();
  });

  it("fails closed with zero domain dispatch when the resolved phone number belongs to a different business than the connection", async () => {
    findFirstPhoneNumber.mockResolvedValue({
      ...phoneNumber,
      businessId: "biz_other",
      business,
    });

    const touched = await processNormalizedEvents(connection, [textEvent()]);

    expect(touched).toEqual([]);
    expect(messageCreate).not.toHaveBeenCalled();
    expect(conversationUpsert).not.toHaveBeenCalled();
  });

  it("handles a delivery status update event: updates the matching Message by externalMessageId", async () => {
    findFirstMessage.mockResolvedValue({
      id: "msg_out_1",
      wamid: "wamid.TEXT_MESSAGE_ID_001",
    });
    const status: DeliveryStatus = {
      kind: "status",
      channel: "whatsapp",
      tenantId: business.id,
      connectionId: connection.id,
      eventId: "wamid.TEXT_MESSAGE_ID_001",
      externalMessageId: "wamid.TEXT_MESSAGE_ID_001",
      status: "delivered",
    };

    const touched = await processNormalizedEvents(connection, [status]);

    expect(touched).toEqual([]);
    expect(messageUpdate).toHaveBeenCalledWith({
      where: { id: "msg_out_1" },
      data: { status: "delivered" },
    });
  });
});
