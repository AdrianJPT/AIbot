import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  cleanupOwnershipFixtures,
  createTestBusinessWithNumber,
  createTestConversation,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";

/**
 * Real-Postgres safety net for tasks #1435 Unit 1.
 *
 * The design (#1424) proposed redefining `dailyAiLimit`'s budget query from
 * counting `Message` rows to counting `EventLog{source:"ai-usage"}` rows.
 * This suite proves that swap is NOT a safe drop-in: `logAiUsage`
 * (message-handler.ts) fires unconditionally on a successful model call,
 * before `sendAndPersistReply` ever persists the `Message` row. If that
 * persistence transaction throws for any reason other than a `dispatchId`
 * P2002 conflict, `flushDueConversation` (reply-window-scheduler.ts) leaves
 * `pendingFlushAt` set and a later sweep retries the same batch — producing
 * a second `EventLog` row for what is ultimately one persisted `Message`.
 *
 * Case (c) below reproduces that divergence against a real database. Cases
 * (a) and (b) are the control: on the ordinary path, and on the
 * already-exhausted-and-notified path, the two counting methods agree.
 *
 * Same literal daily-limit fallback text as
 * message-handler-rate-limit.test.ts (message-handler.ts's DAILY_LIMIT_MESSAGE
 * is not exported).
 */
const DAILY_LIMIT_MESSAGE =
  "Estamos recibiendo muchos mensajes, en breve te responderemos.";

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
let seq = 0;

afterAll(async () => {
  await cleanupOwnershipFixtures(ownerIds);
});

beforeEach(() => {
  generateResponse.mockReset();
  sendFromNumber.mockReset();
  seq += 1;
  generateResponse.mockResolvedValue({
    content: "respuesta de prueba",
    usage: {
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      cachedPromptTokens: 0,
    },
  });
  sendFromNumber.mockResolvedValue(`wamid.PARITY_TEST_${seq}`);
});

async function setupDueConversation(
  suffix: string,
  overrides: Partial<{ dailyAiLimit: number }> = {},
) {
  const user = await createTestUser(`ai-usage-parity-${suffix}`);
  ownerIds.push(user.id);
  const business = await createTestBusinessWithNumber(user.id, suffix, {
    replyWindowMs: 0,
    summaryEnabled: false,
    ...overrides,
  });
  const conversation = await createTestConversation(
    business.id,
    `${suffix}-${seq}`,
  );
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "user",
      content: "hola, necesito ayuda",
      sentBy: "customer",
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { pendingFlushAt: new Date(Date.now() - 1_000) },
  });
  return { business, conversation };
}

async function countBotMessages(conversationId: string): Promise<number> {
  return prisma.message.count({ where: { conversationId, sentBy: "bot" } });
}

async function countAiUsageEvents(businessId: string): Promise<number> {
  return prisma.eventLog.count({ where: { businessId, source: "ai-usage" } });
}

describe("ai-usage counter parity (real DB): Message count vs EventLog count", () => {
  it("(a) one successful non-tool call: Message-count === EventLog-count === 1", async () => {
    const { business, conversation } = await setupDueConversation("agree");

    await sweepDueConversations({ conversationIds: [conversation.id] });

    expect(generateResponse).toHaveBeenCalledTimes(1);
    expect(await countBotMessages(conversation.id)).toBe(1);
    expect(await countAiUsageEvents(business.id)).toBe(1);
  });

  it("(b) budget exhausted and already notified today: both counts stay at their pre-sweep value (0 new)", async () => {
    const { business, conversation } = await setupDueConversation("exhausted", {
      dailyAiLimit: 0,
    });
    // Simulate "already notified today" so resolveAiReply takes the silent
    // branch (message-handler.ts:854-863), not the fallback-send branch.
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: DAILY_LIMIT_MESSAGE,
        sentBy: "bot",
        status: "sent",
      },
    });

    await sweepDueConversations({ conversationIds: [conversation.id] });

    expect(generateResponse).not.toHaveBeenCalled();
    expect(sendFromNumber).not.toHaveBeenCalled();
    // Only the pre-seeded notice message exists — no new bot Message.
    expect(await countBotMessages(conversation.id)).toBe(1);
    expect(await countAiUsageEvents(business.id)).toBe(0);
  });

  it("(c) a transient DB fault mid-persist makes EventLog reach 2 while Message stays 1 — the divergence", async () => {
    const { business, conversation } = await setupDueConversation("divergence");

    // Scoped to sendAndPersistReply's own transaction: every prisma call
    // above (user/business/conversation/message setup) already ran for
    // real. From here, the very next `$transaction` call in this test is
    // the one `sendAndPersistReply` makes inside the first sweep's
    // `doFlush` (message-handler.ts:683-703) — reject it once with a
    // non-`dispatchId` error, exactly the "genuine DB fault mid-flush" case
    // `sendAndPersistReply` (message-handler.ts:704-738) re-throws instead
    // of swallowing, and that `flushDueConversation`
    // (reply-window-scheduler.ts:138-149) responds to by leaving
    // `pendingFlushAt` set for a retry.
    const txSpy = vi.spyOn(prisma, "$transaction");
    txSpy.mockImplementationOnce(() => {
      throw new Error("simulated transient DB fault");
    });

    // First sweep: resolveAiReply succeeds and logs ai-usage EventLog #1,
    // then sendAndPersistReply's persistence transaction throws. The
    // scheduler's outer catch (sweepDueConversations) logs and continues
    // rather than propagating, so this call itself does not throw.
    await sweepDueConversations({ conversationIds: [conversation.id] });

    // Nothing committed: the customer message is still unbatched, and the
    // bot reply never persisted.
    const stillPending = await prisma.message.count({
      where: {
        conversationId: conversation.id,
        sentBy: "customer",
        batchedAt: null,
      },
    });
    expect(stillPending).toBe(1);
    expect(await countBotMessages(conversation.id)).toBe(0);
    expect(await countAiUsageEvents(business.id)).toBe(1);

    // pendingFlushAt must still be set (in the past) for the sweep to pick
    // this conversation up again — proving the retry actually happens
    // rather than the message being silently dropped.
    const afterFirstSweep = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
    });
    expect(afterFirstSweep.pendingFlushAt).not.toBeNull();
    expect(afterFirstSweep.flushLeaseUntil).toBeNull();

    // Second sweep: the same batch is re-read (never marked batchedAt), the
    // budget check still sees 0 bot messages today, so resolveAiReply runs
    // again and logs ai-usage EventLog #2. This time `$transaction` is the
    // real implementation and succeeds.
    await sweepDueConversations({ conversationIds: [conversation.id] });

    txSpy.mockRestore();

    // The finding: one eventual Message, two ai-usage EventLog rows for it.
    expect(generateResponse).toHaveBeenCalledTimes(2);
    expect(await countBotMessages(conversation.id)).toBe(1);
    expect(await countAiUsageEvents(business.id)).toBe(2);
  });
});
