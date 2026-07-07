import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Business, Conversation, PhoneNumber } from "@prisma/client";

const conversationFindMany = vi.fn();
const conversationUpdateMany = vi.fn();
const conversationFindUnique = vi.fn();
const messageFindFirst = vi.fn();
const messageFindMany = vi.fn();
const messageUpdateMany = vi.fn();

vi.mock("../db", () => ({
  prisma: {
    conversation: {
      findMany: (...args: unknown[]) => conversationFindMany(...args),
      updateMany: (...args: unknown[]) => conversationUpdateMany(...args),
      findUnique: (...args: unknown[]) => conversationFindUnique(...args),
    },
    message: {
      findFirst: (...args: unknown[]) => messageFindFirst(...args),
      findMany: (...args: unknown[]) => messageFindMany(...args),
      updateMany: (...args: unknown[]) => messageUpdateMany(...args),
    },
  },
}));

const resolveAiReply = vi.fn();
const sendAndPersistReply = vi.fn();
const isRateLimited = vi.fn();
vi.mock("../message-handler", () => ({
  resolveAiReply: (...args: unknown[]) => resolveAiReply(...args),
  sendAndPersistReply: (...args: unknown[]) => sendAndPersistReply(...args),
  isRateLimited: (...args: unknown[]) => isRateLimited(...args),
}));

const logEvent = vi.fn();
vi.mock("../log", () => ({
  logEvent: (...args: unknown[]) => logEvent(...args),
}));

const business: Business = {
  id: "biz_1",
  name: "Test Business",
  wabaId: null,
  systemPrompt: "prompt",
  welcomeMessage: "welcome",
  businessInfo: {},
  model: "gpt-4o-mini",
  visionModel: null,
  audioModel: null,
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
  businessId: business.id,
  phoneNumberId: "PHONE_ID",
  displayPhone: null,
  whatsappCredentialId: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const pendingFlushAt = new Date("2026-01-01T00:00:05.000Z");

function makeConversation(overrides: Partial<Conversation> = {}) {
  return {
    id: "conv_1",
    businessId: business.id,
    phoneNumberId: phoneNumber.id,
    customerPhone: "5215512345678",
    customerName: null,
    nickname: null,
    status: "active",
    lastMessageAt: new Date(),
    unreadCount: 0,
    pendingFlushAt,
    createdAt: new Date(),
    updatedAt: new Date(),
    business,
    phoneNumber,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // The scheduler module has a module-level `started` guard so it can only
  // ever be started once per process — reset the module registry each test
  // so that guard doesn't leak state across tests (mocks above stay active,
  // vi.mock factories are hoisted and re-applied to the fresh instance).
  vi.resetModules();
  // Defaults matching "everything is fine" — most tests only care about
  // overriding one axis (status/rate-limit/isActive), so the fresh re-fetch
  // and the rate limiter default to a pass-through.
  messageUpdateMany.mockResolvedValue({ count: 0 });
  isRateLimited.mockResolvedValue(false);
});

/**
 * Wires conversationFindUnique to look up by id from a small in-memory list
 * — mirrors what flushDueConversation's fresh re-fetch would get back from a
 * real DB for each conversation under test.
 */
function stubFreshLookup(conversations: ReturnType<typeof makeConversation>[]): void {
  conversationFindUnique.mockImplementation((args: { where: { id: string } }) =>
    Promise.resolve(conversations.find((c) => c.id === args.where.id) ?? null)
  );
}

async function freshScheduler() {
  const mod = await import("../reply-window-scheduler");
  return mod.startReplyWindowScheduler;
}

describe("startReplyWindowScheduler", () => {
  it("is a no-op to call twice — only one interval loop runs (module-level guard)", async () => {
    const startReplyWindowScheduler = await freshScheduler();

    const before = vi.getTimerCount();
    startReplyWindowScheduler();
    const afterFirst = vi.getTimerCount();
    startReplyWindowScheduler();
    const afterSecond = vi.getTimerCount();

    expect(afterFirst).toBe(before + 1);
    expect(afterSecond).toBe(afterFirst);

    vi.clearAllTimers();
    vi.useRealTimers();
  });
});

describe("reply-window sweep", () => {
  async function tick() {
    await vi.advanceTimersByTimeAsync(3000);
  }

  it("claims a due conversation, batches pending customer messages, and sends one reply", async () => {
    const conversation = makeConversation();
    conversationFindMany.mockResolvedValue([conversation]);
    conversationUpdateMany.mockResolvedValue({ count: 1 });
    stubFreshLookup([conversation]);
    messageFindMany.mockImplementation((args: { where: Record<string, unknown> }) => {
      if (args.where.sentBy === "customer") {
        expect(args.where).toMatchObject({ batchedAt: null });
        return Promise.resolve([
          { id: "m1", content: "hola", createdAt: new Date("2026-01-01T00:00:01.000Z") },
          { id: "m2", content: "quiero una reserva", createdAt: new Date("2026-01-01T00:00:02.000Z") },
        ]);
      }
      return Promise.resolve([]); // history query
    });
    resolveAiReply.mockResolvedValue("Respuesta batcheada");

    const startReplyWindowScheduler = await freshScheduler();
    startReplyWindowScheduler();
    await tick();

    expect(conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: "conv_1", pendingFlushAt },
      data: { pendingFlushAt: null },
    });

    // The batch is marked consumed before the AI is called (bug 3 fix) —
    // can't be double-counted by an overlapping flush.
    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["m1", "m2"] } },
      data: { batchedAt: expect.any(Date) },
    });

    expect(resolveAiReply).toHaveBeenCalledTimes(1);
    const [calledBusiness, calledConversationId, , calledContent] = resolveAiReply.mock.calls[0];
    expect(calledBusiness.id).toBe("biz_1");
    expect(calledConversationId).toBe("conv_1");
    expect(calledContent).toContain("hola");
    expect(calledContent).toContain("quiero una reserva");
    const parsed = JSON.parse(calledContent.slice(calledContent.indexOf("[")));
    expect(parsed).toEqual([
      { message: "hola", n: 1, time: "2026-01-01T00:00:01.000Z" },
      { message: "quiero una reserva", n: 2, time: "2026-01-01T00:00:02.000Z" },
    ]);

    expect(sendAndPersistReply).toHaveBeenCalledWith(
      expect.objectContaining({ id: "biz_1" }),
      expect.objectContaining({ id: "phone_1" }),
      "conv_1",
      "5215512345678",
      "Respuesta batcheada"
    );

    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("skips a conversation whose claim was already taken (count 0) — no double flush", async () => {
    conversationFindMany.mockResolvedValue([makeConversation()]);
    conversationUpdateMany.mockResolvedValue({ count: 0 });

    const startReplyWindowScheduler = await freshScheduler();
    startReplyWindowScheduler();
    await tick();

    expect(conversationFindUnique).not.toHaveBeenCalled();
    expect(messageFindMany).not.toHaveBeenCalled();
    expect(resolveAiReply).not.toHaveBeenCalled();
    expect(sendAndPersistReply).not.toHaveBeenCalled();

    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("logs and continues the sweep when one conversation's flush throws", async () => {
    const bad = makeConversation({ id: "conv_bad" });
    const ok = makeConversation({ id: "conv_ok" });
    conversationFindMany.mockResolvedValue([bad, ok]);
    conversationUpdateMany.mockResolvedValue({ count: 1 });
    stubFreshLookup([bad, ok]);
    messageFindMany.mockImplementation((args: { where: Record<string, unknown> }) => {
      if (args.where.sentBy === "customer" && args.where.conversationId === "conv_bad") {
        throw new Error("boom");
      }
      if (args.where.sentBy === "customer") {
        return Promise.resolve([
          { id: "m1", content: "hola", createdAt: new Date("2026-01-01T00:00:01.000Z") },
        ]);
      }
      return Promise.resolve([]);
    });
    resolveAiReply.mockResolvedValue("ok");

    const startReplyWindowScheduler = await freshScheduler();
    startReplyWindowScheduler();
    await tick();

    expect(logEvent).toHaveBeenCalledWith(
      "error",
      "ai",
      "Reply-window flush failed",
      expect.objectContaining({ conversationId: "conv_bad" }),
      business.id
    );
    // The second (healthy) conversation still gets flushed despite the first failing.
    expect(sendAndPersistReply).toHaveBeenCalledTimes(1);

    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("does not call the AI or send a reply when the conversation was handed off to a human before the flush ran", async () => {
    const conversation = makeConversation();
    conversationFindMany.mockResolvedValue([conversation]);
    conversationUpdateMany.mockResolvedValue({ count: 1 });
    // The status changed to handed_off between the message arriving and the
    // window elapsing — the fresh re-fetch must see it, not the stale
    // `status: "active"` on the conversation object the sweep first queried.
    stubFreshLookup([{ ...conversation, status: "handed_off" }]);

    const startReplyWindowScheduler = await freshScheduler();
    startReplyWindowScheduler();
    await tick();

    expect(conversationFindUnique).toHaveBeenCalledWith({
      where: { id: "conv_1" },
      include: { business: true, phoneNumber: true },
    });
    expect(messageFindMany).not.toHaveBeenCalled();
    expect(resolveAiReply).not.toHaveBeenCalled();
    expect(sendAndPersistReply).not.toHaveBeenCalled();

    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("does not call the AI or send a reply when the conversation is currently rate-limited", async () => {
    const conversation = makeConversation();
    conversationFindMany.mockResolvedValue([conversation]);
    conversationUpdateMany.mockResolvedValue({ count: 1 });
    stubFreshLookup([conversation]);
    messageFindMany.mockImplementation((args: { where: Record<string, unknown> }) => {
      if (args.where.sentBy === "customer") {
        return Promise.resolve([
          { id: "m1", content: "hola", createdAt: new Date("2026-01-01T00:00:01.000Z") },
        ]);
      }
      return Promise.resolve([]);
    });
    isRateLimited.mockResolvedValue(true);

    const startReplyWindowScheduler = await freshScheduler();
    startReplyWindowScheduler();
    await tick();

    expect(isRateLimited).toHaveBeenCalledWith("conv_1", "biz_1");
    // Messages are still marked consumed — the batch is skipped, not held
    // back for a future flush to double-count.
    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["m1"] } },
      data: { batchedAt: expect.any(Date) },
    });
    expect(resolveAiReply).not.toHaveBeenCalled();
    expect(sendAndPersistReply).not.toHaveBeenCalled();

    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("does not send a reply when the business or phone number was deactivated before the flush ran", async () => {
    const conversation = makeConversation();
    conversationFindMany.mockResolvedValue([conversation]);
    conversationUpdateMany.mockResolvedValue({ count: 1 });
    stubFreshLookup([
      { ...conversation, business: { ...business, isActive: false } },
    ]);

    const startReplyWindowScheduler = await freshScheduler();
    startReplyWindowScheduler();
    await tick();

    expect(messageFindMany).not.toHaveBeenCalled();
    expect(resolveAiReply).not.toHaveBeenCalled();
    expect(sendAndPersistReply).not.toHaveBeenCalled();

    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("does not send a reply when the phone number itself was deactivated before the flush ran", async () => {
    const conversation = makeConversation();
    conversationFindMany.mockResolvedValue([conversation]);
    conversationUpdateMany.mockResolvedValue({ count: 1 });
    stubFreshLookup([
      { ...conversation, phoneNumber: { ...phoneNumber, isActive: false } },
    ]);

    const startReplyWindowScheduler = await freshScheduler();
    startReplyWindowScheduler();
    await tick();

    expect(messageFindMany).not.toHaveBeenCalled();
    expect(resolveAiReply).not.toHaveBeenCalled();
    expect(sendAndPersistReply).not.toHaveBeenCalled();

    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("selects pending messages purely by batchedAt, so a message is never dropped due to an unrelated overlapping flush's later bot-reply timestamp", async () => {
    // Regression for the message-loss race (bug 3): previously the query
    // compared createdAt against the last bot message's createdAt. If some
    // OTHER slow/overlapping flush's bot reply got persisted with a
    // timestamp AFTER this still-unbatched customer message, the old query
    // would wrongly exclude it. The fix removed that comparison entirely —
    // selection is now solely `sentBy: "customer", batchedAt: null`, so it
    // can't be affected by any bot message's timestamp at all.
    const conversation = makeConversation();
    conversationFindMany.mockResolvedValue([conversation]);
    conversationUpdateMany.mockResolvedValue({ count: 1 });
    stubFreshLookup([conversation]);

    const customerMessage = {
      id: "m_customer",
      content: "¿siguen abiertos?",
      // Earlier than the unrelated bot reply below — under the old
      // lastBotMessage-cursor logic this would have been excluded.
      createdAt: new Date("2026-01-01T00:00:01.000Z"),
    };

    messageFindMany.mockImplementation((args: { where: Record<string, unknown> }) => {
      if (args.where.sentBy === "customer") {
        // Selection must be by batchedAt only — no createdAt/gt comparison.
        expect(args.where).toEqual({
          conversationId: "conv_1",
          sentBy: "customer",
          batchedAt: null,
        });
        return Promise.resolve([customerMessage]);
      }
      return Promise.resolve([]); // history query
    });
    resolveAiReply.mockResolvedValue("Respuesta");

    const startReplyWindowScheduler = await freshScheduler();
    startReplyWindowScheduler();
    await tick();

    // The customer message from this window was included and answered,
    // despite an unrelated flush's bot reply having a later timestamp.
    expect(resolveAiReply).toHaveBeenCalledTimes(1);
    const [, , , calledContent] = resolveAiReply.mock.calls[0];
    expect(calledContent).toContain("¿siguen abiertos?");
    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["m_customer"] } },
      data: { batchedAt: expect.any(Date) },
    });
    expect(sendAndPersistReply).toHaveBeenCalledTimes(1);

    vi.clearAllTimers();
    vi.useRealTimers();
  });
});
