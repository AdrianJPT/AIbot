import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { prisma } from "@/lib/db";
import {
  cleanupOwnershipFixtures,
  createTestBusinessWithNumber,
  createTestConversation,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";
import { TOOL_LOOP_CEILING_MESSAGE } from "@/lib/tools/loop";

/**
 * Real-DB wiring tests for the tool-calling loop's integration into the
 * live reply path (`resolveAiReply` in `../message-handler.ts`, via
 * `sweepDueConversations`). Companion to:
 *  - `tool-loop-golden-baseline.test.ts` (re-run unmodified — flags-off
 *    parity is proven there, not here).
 *  - `ai-usage-counter-parity.test.ts` (the daily-budget counter itself).
 *  - `src/lib/tools/__tests__/loop.test.ts` (the loop's own turn-taking,
 *    isolated from this wiring).
 *
 * `callWithAiCredential` is mocked here (not exercised for real) so each
 * test can control which `provider` string the "resolved candidate" carries
 * — provider resolution itself is `ai/resolve.ts`'s own concern, covered by
 * `ai/__tests__/resolve.test.ts`. `generateResponse` is mocked for the
 * non-tool-loop fallback branch; the tool-loop branch drives a hand-built
 * fake OpenAI client directly, since `runToolLoop` calls
 * `client.chat.completions.create` itself.
 */

let currentProvider = "openai";
const fakeCreate = vi.fn();
const fakeClient = { chat: { completions: { create: fakeCreate } } };

const generateResponse = vi.fn();
vi.mock("../ai/generate", () => ({
  generateResponse: (...args: unknown[]) => generateResponse(...args),
}));

vi.mock("../ai/resolve", () => ({
  callWithAiCredential: (
    _business: unknown,
    fn: (client: unknown, provider: string) => unknown,
  ) => fn(fakeClient, currentProvider),
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

function toolCallResponse(toolCallId: string, args: unknown) {
  return {
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            {
              id: toolCallId,
              type: "function",
              function: {
                name: "kernel_probe",
                arguments: JSON.stringify(args),
              },
            },
          ],
        },
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      prompt_tokens_details: { cached_tokens: 0 },
    },
  };
}

function finalResponse(content: string) {
  return {
    choices: [{ message: { content, tool_calls: undefined } }],
    usage: {
      prompt_tokens: 8,
      completion_tokens: 3,
      total_tokens: 11,
      prompt_tokens_details: { cached_tokens: 0 },
    },
  };
}

const ownerIds: string[] = [];

afterAll(async () => {
  await cleanupOwnershipFixtures(ownerIds);
  await prisma.appConfig.deleteMany({ where: { id: "default" } });
});

afterEach(async () => {
  // Every test in this file shares one Postgres schema (vitest isolates by
  // FILE, not by test) — the platform-wide AppConfig row must not leak a
  // tools-enabled state from one test into the next.
  await prisma.appConfig.deleteMany({ where: { id: "default" } });
});

beforeEach(() => {
  currentProvider = "openai";
  generateResponse.mockReset();
  sendFromNumber.mockReset();
  fakeCreate.mockReset();
  sendFromNumber.mockResolvedValue(
    `wamid.TOOL_LOOP_TEST_${crypto.randomUUID()}`,
  );
});

async function enablePlatformTools(): Promise<void> {
  await prisma.appConfig.upsert({
    where: { id: "default" },
    update: { toolsEnabled: true },
    create: { id: "default", toolsEnabled: true },
  });
}

async function setupDueConversation(
  suffix: string,
  overrides: Partial<{ dailyAiLimit: number }> = {},
) {
  const user = await createTestUser(`tool-loop-wiring-${suffix}`);
  ownerIds.push(user.id);
  const business = await createTestBusinessWithNumber(user.id, suffix, {
    replyWindowMs: 0,
    summaryEnabled: false,
    toolsEnabled: true,
    ...overrides,
  });
  const conversation = await createTestConversation(business.id, suffix);
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "user",
      content: "¿Podés confirmar que la herramienta funciona?",
      sentBy: "customer",
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { pendingFlushAt: new Date(Date.now() - 1_000) },
  });
  return { business, conversation };
}

describe("tool loop wiring — both flags on, provider on the allow-list", () => {
  it("runs the loop end to end: executes kernel_probe, sends the model's follow-up as the one reply", async () => {
    await enablePlatformTools();
    const { business, conversation } = await setupDueConversation("happy-path");
    fakeCreate
      .mockResolvedValueOnce(toolCallResponse("call_1", { echo: "ping" }))
      .mockResolvedValueOnce(finalResponse("El kernel está vivo."));

    await sweepDueConversations({ conversationIds: [conversation.id] });

    expect(generateResponse).not.toHaveBeenCalled();
    expect(fakeCreate).toHaveBeenCalledTimes(2);
    expect(sendFromNumber).toHaveBeenCalledTimes(1);

    const botMessage = await prisma.message.findFirstOrThrow({
      where: { conversationId: conversation.id, sentBy: "bot" },
    });
    expect(botMessage.content).toBe("El kernel está vivo.");

    const audit = await prisma.toolExecutionAudit.findFirst({
      where: { toolName: "kernel_probe" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.outcome).toBe("success");

    const eventLogs = await prisma.eventLog.count({
      where: { businessId: business.id, source: "ai-usage" },
    });
    // One EventLog per actual model call (2), not one per reply (1) — spend
    // stays visible rather than being hidden behind the single Message row.
    expect(eventLogs).toBe(2);
  });

  it("caps the loop's own step budget by the remaining daily allowance, seeded from the existing daily-limit check", async () => {
    await enablePlatformTools();
    // dailyAiLimit: 1 with 0 bot messages sent today leaves exactly 1 step
    // of remaining budget — strictly less than MAX_TOOL_LOOP_STEPS (2) — so
    // the loop must refuse the tool call on its only allowed step rather
    // than reaching for a second model call the daily budget doesn't cover.
    const { conversation } = await setupDueConversation("budget-seed", {
      dailyAiLimit: 1,
    });
    fakeCreate.mockResolvedValueOnce(
      toolCallResponse("call_1", { echo: "ping" }),
    );

    await sweepDueConversations({ conversationIds: [conversation.id] });

    expect(fakeCreate).toHaveBeenCalledTimes(1);
    const botMessage = await prisma.message.findFirstOrThrow({
      where: { conversationId: conversation.id, sentBy: "bot" },
    });
    expect(botMessage.content).toBe(TOOL_LOOP_CEILING_MESSAGE);
    expect(sendFromNumber).toHaveBeenCalledTimes(1);
  });

  it("sends the fixed ceiling fallback — never silence, never a raw error — when the model keeps requesting tools past the step ceiling", async () => {
    await enablePlatformTools();
    const { conversation } = await setupDueConversation("ceiling-hit");
    fakeCreate
      .mockResolvedValueOnce(toolCallResponse("call_1", { echo: "one" }))
      .mockResolvedValueOnce(toolCallResponse("call_2", { echo: "two" }));

    await sweepDueConversations({ conversationIds: [conversation.id] });

    const botMessage = await prisma.message.findFirstOrThrow({
      where: { conversationId: conversation.id, sentBy: "bot" },
    });
    expect(botMessage.content).toBe(TOOL_LOOP_CEILING_MESSAGE);
    expect(sendFromNumber).toHaveBeenCalledTimes(1);
  });
});

describe("tool loop wiring — provider allow-list", () => {
  it("aborts the loop and falls back to a plain single-shot reply when the resolved candidate is not 'openai'", async () => {
    await enablePlatformTools();
    currentProvider = "openrouter";
    const { conversation } = await setupDueConversation("non-openai");
    generateResponse.mockResolvedValue({
      content: "Respuesta sin herramientas.",
      usage: {
        promptTokens: 4,
        completionTokens: 2,
        totalTokens: 6,
        cachedPromptTokens: 0,
      },
    });

    await sweepDueConversations({ conversationIds: [conversation.id] });

    // No tools-bearing request was ever made against the unvetted provider.
    expect(fakeCreate).not.toHaveBeenCalled();
    expect(generateResponse).toHaveBeenCalledTimes(1);
    const botMessage = await prisma.message.findFirstOrThrow({
      where: { conversationId: conversation.id, sentBy: "bot" },
    });
    expect(botMessage.content).toBe("Respuesta sin herramientas.");
    expect(sendFromNumber).toHaveBeenCalledTimes(1);
  });
});

describe("tool loop wiring — reply lease across a crashed mid-loop attempt (real DB)", () => {
  it("reclaims a conversation whose flush crashed mid-loop and delivers exactly one reply", async () => {
    await enablePlatformTools();
    const user = await createTestUser("tool-loop-wiring-crash");
    ownerIds.push(user.id);
    const business = await createTestBusinessWithNumber(user.id, "crash", {
      replyWindowMs: 0,
      summaryEnabled: false,
      toolsEnabled: true,
    });
    const phoneNumber = business.phoneNumbers[0];

    // Same shape as the codebase's own "orphan reclaim after lease expiry"
    // test (dispatch-resumability.test.ts): a lease claimed and then
    // abandoned, standing in for a process that died mid-flush. Here that
    // death is specifically mid-TOOL-LOOP — this conversation's reply
    // requires two model calls, not one, so a crash between them is squarely
    // inside the window FLUSH_LEASE_MS covers.
    const conversation = await prisma.conversation.create({
      data: {
        businessId: business.id,
        phoneNumberId: phoneNumber.id,
        customerPhone: "5215500009999",
        status: "active",
        pendingFlushAt: new Date(Date.now() - 1000),
        flushLeaseUntil: new Date(Date.now() - 500),
      },
    });
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: "¿Anda la herramienta?",
        sentBy: "customer",
      },
    });
    fakeCreate
      .mockResolvedValueOnce(toolCallResponse("call_1", { echo: "ping" }))
      .mockResolvedValueOnce(finalResponse("Sí, anda."));

    await sweepDueConversations({ conversationIds: [conversation.id] });

    expect(sendFromNumber).toHaveBeenCalledTimes(1);
    const botMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id, sentBy: "bot" },
    });
    expect(botMessages).toHaveLength(1);
    expect(botMessages[0].content).toBe("Sí, anda.");

    const fresh = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
    });
    expect(fresh.pendingFlushAt).toBeNull();
    expect(fresh.flushLeaseUntil).toBeNull();
  });
});
