import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  cleanupOwnershipFixtures,
  createTestBusinessWithNumber,
  createTestConversation,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";

/**
 * Golden baseline for tasks #1435 Unit 1.
 *
 * Captures today's exact observable output — every `Message` row and every
 * `EventLog` row written — for one fixed conversation and one fixed customer
 * message batch, run through the real `sweepDueConversations` -> `doFlush`
 * -> `resolveAiReply` -> `sendAndPersistReply` path (only the AI/WhatsApp
 * boundary is mocked; `../db` is real Postgres).
 *
 * This is the literal spec scenario `Off by Default at Both Scopes` /
 * "Platform default off, business not opted in" baseline half. Unit 5 MUST
 * re-run this file UNMODIFIED once the real `AppConfig.toolsEnabled` /
 * `Business.toolsEnabled` flags exist (both still `false`) and prove
 * byte-identical output — see tasks #1435 Unit 1 and Unit 5 task 5.5.
 *
 * Volatile fields (ids, timestamps, the conversation's own id/business id)
 * are stripped before comparison; every semantically meaningful field is
 * asserted against a literal expected value so a future change to this
 * path's behavior fails loudly here, not silently.
 */

const FIXED_REPLY = "Golden baseline: respuesta fija de prueba.";
const FIXED_USAGE = {
  promptTokens: 42,
  completionTokens: 17,
  totalTokens: 59,
  cachedPromptTokens: 0,
};
const FIXED_CUSTOMER_MESSAGE = "Hola, ¿cuál es el horario de atención?";
const FIXED_WAMID = "wamid.GOLDEN_BASELINE_OUTBOUND";

const generateResponse = vi.fn();
vi.mock("../ai/generate", () => ({
  generateResponse: (...args: unknown[]) => generateResponse(...args),
}));

vi.mock("../ai/resolve", () => ({
  callWithAiCredential: (
    _business: unknown,
    fn: (client: unknown) => unknown,
  ) => fn({ marker: "fake-ai-client" }),
  resolveModels: async () => ({
    chatModel: "gpt-4o-mini",
    visionModel: "gpt-4o-mini",
    audioModel: "whisper-1",
  }),
}));

const sendFromNumber = vi.fn();
vi.mock("../whatsapp", () => ({
  sendFromNumber: (...args: unknown[]) => sendFromNumber(...args),
  resolveWhatsappToken: vi.fn().mockResolvedValue("test-token"),
}));

const { sweepDueConversations } = await import("../reply-window-scheduler");

const ownerIds: string[] = [];

afterAll(async () => {
  await cleanupOwnershipFixtures(ownerIds);
});

beforeEach(() => {
  generateResponse.mockReset();
  sendFromNumber.mockReset();
  generateResponse.mockResolvedValue({
    content: FIXED_REPLY,
    usage: FIXED_USAGE,
  });
  sendFromNumber.mockResolvedValue(FIXED_WAMID);
});

describe("tool-loop golden baseline (real DB, pre-kernel): today's exact off-path output", () => {
  it("one fixed conversation, one fixed customer batch: snapshot every Message and EventLog row written", async () => {
    const user = await createTestUser("tool-loop-golden-baseline");
    ownerIds.push(user.id);
    const business = await createTestBusinessWithNumber(
      user.id,
      "golden-baseline",
      { replyWindowMs: 0, summaryEnabled: false },
    );
    const conversation = await createTestConversation(
      business.id,
      "golden-baseline",
    );
    const customerMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: FIXED_CUSTOMER_MESSAGE,
        sentBy: "customer",
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { pendingFlushAt: new Date(Date.now() - 1_000) },
    });

    await sweepDueConversations({ conversationIds: [conversation.id] });

    const messages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
    });
    const normalizedMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
      mediaType: m.mediaType,
      sentBy: m.sentBy,
      status: m.status,
      batchedAt: m.batchedAt !== null,
      wamid: m.wamid,
      quotedWamid: m.quotedWamid,
      dispatchId: typeof m.dispatchId === "string",
      failureCode: m.failureCode,
    }));

    expect(normalizedMessages).toEqual([
      {
        role: "user",
        content: FIXED_CUSTOMER_MESSAGE,
        mediaType: "text",
        sentBy: "customer",
        status: "sent",
        batchedAt: true,
        wamid: null,
        quotedWamid: null,
        dispatchId: false,
        failureCode: null,
      },
      {
        role: "assistant",
        content: FIXED_REPLY,
        mediaType: "text",
        sentBy: "bot",
        status: "sent",
        batchedAt: false,
        wamid: FIXED_WAMID,
        quotedWamid: null,
        dispatchId: true,
        failureCode: null,
      },
    ]);

    const eventLogs = await prisma.eventLog.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "asc" },
    });
    const normalizedEventLogs = eventLogs.map((e) => ({
      level: e.level,
      source: e.source,
      message: e.message,
      detail:
        e.detail && typeof e.detail === "object"
          ? { ...(e.detail as Record<string, unknown>), conversationId: "<id>" }
          : e.detail,
    }));

    expect(normalizedEventLogs).toEqual([
      {
        level: "info",
        source: "ai-usage",
        message: "AI call token usage",
        detail: {
          conversationId: "<id>",
          model: "gpt-4o-mini",
          ...FIXED_USAGE,
        },
      },
    ]);

    // Exactly one reply sent, no retries, no fallback text — the fully
    // ordinary off-path route.
    expect(generateResponse).toHaveBeenCalledTimes(1);
    expect(sendFromNumber).toHaveBeenCalledTimes(1);
    expect(customerMessage.batchedAt).toBeNull(); // sanity: was unbatched at creation
  });
});
