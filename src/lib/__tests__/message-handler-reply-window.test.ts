import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildBusiness, buildPhoneNumber } from "./fixtures/business";
import { buildAiReply } from "./fixtures/ai-reply";
import { textMessagePayload } from "./fixtures/webhook-payload";

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
    $transaction: (ops: unknown[]) => Promise.all(ops),
  },
}));

const generateResponse = vi.fn();
vi.mock("../ai/generate", () => ({
  generateResponse: (...args: unknown[]) => generateResponse(...args),
}));

const callWithAiCredential = vi.fn(
  (_business: unknown, fn: (client: unknown) => unknown) =>
    fn({ marker: "fake-ai-client" }),
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

const baseBusiness = buildBusiness({ replyWindowMs: 30_000 });

const phoneNumber = buildPhoneNumber();

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
  generateResponse.mockResolvedValue(buildAiReply());
  resolveWhatsappToken.mockResolvedValue("test-token");
  sendFromNumber.mockResolvedValue("wamid.OUTBOUND_001");
});

/**
 * Ingest never calls the AI or sends, regardless of `replyWindowMs` — that
 * split disappeared with the ingest/dispatch cut (design §3). What ingest
 * still owns is computing the right due time on `pendingFlushAt`. AI
 * generation, rate limiting, the document canned reply, and sending are all
 * exercised against the sweep instead — see reply-window-scheduler.test.ts
 * and dispatch-resumability.test.ts.
 */
describe("reply window (Business.replyWindowMs) — ingest due-time computation", () => {
  it("sets pendingFlushAt in the future and never touches the AI/send path when replyWindowMs > 0", async () => {
    findFirstPhoneNumber.mockResolvedValue({
      ...phoneNumber,
      business: baseBusiness,
    });

    await processWebhookPayload(textMessagePayload);

    expect(generateResponse).not.toHaveBeenCalled();
    expect(sendFromNumber).not.toHaveBeenCalled();
    // Only the customer message persisted, never a bot reply — that only
    // ever happens in the sweep now.
    expect(messageCreate).toHaveBeenCalledTimes(1);

    const pendingUpdateCall = conversationUpdate.mock.calls.find(
      (call) => call[0]?.data?.pendingFlushAt instanceof Date,
    );
    expect(pendingUpdateCall).toBeTruthy();
    expect(pendingUpdateCall![0]).toMatchObject({ where: { id: "conv_1" } });
    expect(pendingUpdateCall![0].data.pendingFlushAt.getTime()).toBeGreaterThan(
      Date.now(),
    );
  });

  it("sets pendingFlushAt to (approximately) now, never touching the AI/send path, when replyWindowMs is 0 (default/backward-compatible) — the sweep dispatches it on the very next tick", async () => {
    findFirstPhoneNumber.mockResolvedValue({
      ...phoneNumber,
      business: { ...baseBusiness, replyWindowMs: 0 },
    });

    const before = Date.now();
    await processWebhookPayload(textMessagePayload);
    const after = Date.now();

    expect(generateResponse).not.toHaveBeenCalled();
    expect(sendFromNumber).not.toHaveBeenCalled();

    const pendingUpdateCall = conversationUpdate.mock.calls.find(
      (call) => call[0]?.data?.pendingFlushAt instanceof Date,
    );
    expect(pendingUpdateCall).toBeTruthy();
    const pendingFlushAt: Date = pendingUpdateCall![0].data.pendingFlushAt;
    expect(pendingFlushAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(pendingFlushAt.getTime()).toBeLessThanOrEqual(after);
  });
});
