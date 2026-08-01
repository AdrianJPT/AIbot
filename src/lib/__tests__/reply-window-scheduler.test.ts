import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Conversation } from "@prisma/client";
import { buildBusiness, buildPhoneNumber } from "./fixtures/business";

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
const computeDispatchId = vi.fn();
vi.mock("../message-handler", () => ({
  resolveAiReply: (...args: unknown[]) => resolveAiReply(...args),
  sendAndPersistReply: (...args: unknown[]) => sendAndPersistReply(...args),
  isRateLimited: (...args: unknown[]) => isRateLimited(...args),
  computeDispatchId: (...args: unknown[]) => computeDispatchId(...args),
}));

const logEvent = vi.fn();
vi.mock("../log", () => ({
  logEvent: (...args: unknown[]) => logEvent(...args),
}));

const { sweepDueConversations, startReplyWindowScheduler } =
  await import("../reply-window-scheduler");

const business = buildBusiness({
  systemPrompt: "prompt",
  welcomeMessage: "welcome",
  visionModel: null,
  audioModel: null,
  replyWindowMs: 30_000,
});

const phoneNumber = buildPhoneNumber({ phoneNumberId: "PHONE_ID" });

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
    flushLeaseUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    business,
    phoneNumber,
    ...overrides,
  };
}

/**
 * Wires conversationFindUnique to look up by id from a small in-memory list
 * — mirrors what doFlush's fresh re-fetch would get back from a real DB for
 * each conversation under test.
 */
function stubFreshLookup(
  conversations: ReturnType<typeof makeConversation>[],
): void {
  conversationFindUnique.mockImplementation((args: { where: { id: string } }) =>
    Promise.resolve(conversations.find((c) => c.id === args.where.id) ?? null),
  );
}

/**
 * Distinguishes flushDueConversation's two `conversation.updateMany` calls:
 * the claim (sets `flushLeaseUntil`, no `pendingFlushAt` key) vs a release
 * (always has a `flushLeaseUntil` key; a success-release also carries
 * `pendingFlushAt: null`). Defaults both to succeeding — most tests only
 * care about overriding the claim's result.
 */
function stubClaimAndRelease(
  claimCount: number,
  opts: { releaseCount?: number } = {},
): void {
  const releaseCount = opts.releaseCount ?? 1;
  conversationUpdateMany.mockImplementation(
    (args: { data: Record<string, unknown> }) => {
      if (!("pendingFlushAt" in args.data)) {
        // Claim call (flushLeaseUntil set) or a lease-only release
        // (flushLeaseUntil: null, no pendingFlushAt key) — both share this
        // shape, distinguished only by which one runs first per test.
        return Promise.resolve({ count: claimCount });
      }
      return Promise.resolve({ count: releaseCount });
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  messageUpdateMany.mockResolvedValue({ count: 0 });
  isRateLimited.mockResolvedValue(false);
  computeDispatchId.mockReturnValue("dispatch_default");
  sendAndPersistReply.mockResolvedValue(undefined);
});

// TEMPORARY: startReplyWindowScheduler and this test are both removed in a
// later commit that replaces the in-process setInterval with the external
// drain endpoint plus a NODE_ENV-guarded dev ticker (design §6).
describe("startReplyWindowScheduler", () => {
  it("is a no-op to call twice — only one interval loop runs (module-level guard)", () => {
    vi.useFakeTimers();

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

describe("sweepDueConversations", () => {
  it("scopes the due query by conversationIds when given (inline webhook path)", async () => {
    conversationFindMany.mockResolvedValue([]);

    await sweepDueConversations({ conversationIds: ["conv_a", "conv_b"] });

    expect(conversationFindMany).toHaveBeenCalledWith({
      where: {
        pendingFlushAt: { lte: expect.any(Date) },
        id: { in: ["conv_a", "conv_b"] },
      },
      include: { business: true, phoneNumber: true },
    });
  });

  it("runs an unscoped due query when no conversationIds are given (external drain path)", async () => {
    conversationFindMany.mockResolvedValue([]);

    await sweepDueConversations();

    expect(conversationFindMany).toHaveBeenCalledWith({
      where: { pendingFlushAt: { lte: expect.any(Date) } },
      include: { business: true, phoneNumber: true },
    });
  });

  it("claims a due conversation via the flush lease, batches pending customer messages, and sends one reply, then releases both markers", async () => {
    const conversation = makeConversation();
    conversationFindMany.mockResolvedValue([conversation]);
    stubClaimAndRelease(1);
    stubFreshLookup([conversation]);
    messageFindMany.mockImplementation(
      (args: { where: Record<string, unknown> }) => {
        if (args.where.sentBy === "customer") {
          expect(args.where).toMatchObject({ batchedAt: null });
          return Promise.resolve([
            {
              id: "m1",
              content: "hola",
              mediaType: "text",
              createdAt: new Date("2026-01-01T00:00:01.000Z"),
            },
            {
              id: "m2",
              content: "quiero una reserva",
              mediaType: "text",
              createdAt: new Date("2026-01-01T00:00:02.000Z"),
            },
          ]);
        }
        return Promise.resolve([]); // history query
      },
    );
    resolveAiReply.mockResolvedValue("Respuesta batcheada");
    computeDispatchId.mockReturnValue("dispatch_conv1");

    await sweepDueConversations();

    // Claim: sets a future lease, does not null out pendingFlushAt.
    expect(conversationUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "conv_1",
        pendingFlushAt,
        OR: [
          { flushLeaseUntil: null },
          { flushLeaseUntil: { lte: expect.any(Date) } },
        ],
      },
      data: { flushLeaseUntil: expect.any(Date) },
    });

    expect(computeDispatchId).toHaveBeenCalledWith("conv_1", ["m1", "m2"]);

    expect(resolveAiReply).toHaveBeenCalledTimes(1);
    const [calledBusiness, calledConversationId, , calledContent] =
      resolveAiReply.mock.calls[0];
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
      "Respuesta batcheada",
      "dispatch_conv1",
      ["m1", "m2"],
    );

    // Release: compare-and-set clear of both markers.
    expect(conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: "conv_1", pendingFlushAt },
      data: { pendingFlushAt: null, flushLeaseUntil: null },
    });
  });

  it("skips a conversation whose lease is already held (claim count 0) — no double flush", async () => {
    conversationFindMany.mockResolvedValue([makeConversation()]);
    stubClaimAndRelease(0);

    await sweepDueConversations();

    expect(conversationFindUnique).not.toHaveBeenCalled();
    expect(messageFindMany).not.toHaveBeenCalled();
    expect(resolveAiReply).not.toHaveBeenCalled();
    expect(sendAndPersistReply).not.toHaveBeenCalled();
  });

  it("sends a canned reply with no AI call when every pending message in the batch is a document", async () => {
    const conversation = makeConversation();
    conversationFindMany.mockResolvedValue([conversation]);
    stubClaimAndRelease(1);
    stubFreshLookup([conversation]);
    messageFindMany.mockImplementation(
      (args: { where: Record<string, unknown> }) => {
        if (args.where.sentBy === "customer") {
          return Promise.resolve([
            {
              id: "m_doc",
              content: "[Documento adjunto]",
              mediaType: "document",
              createdAt: new Date("2026-01-01T00:00:01.000Z"),
            },
          ]);
        }
        return Promise.resolve([]);
      },
    );
    computeDispatchId.mockReturnValue("dispatch_doc");

    await sweepDueConversations();

    expect(resolveAiReply).not.toHaveBeenCalled();
    expect(isRateLimited).not.toHaveBeenCalled();
    expect(sendAndPersistReply).toHaveBeenCalledWith(
      expect.objectContaining({ id: "biz_1" }),
      expect.objectContaining({ id: "phone_1" }),
      "conv_1",
      "5215512345678",
      "Por ahora no puedo leer archivos o documentos. ¿Puedes escribir tu consulta en un mensaje de texto?",
      "dispatch_doc",
      ["m_doc"],
    );
  });

  it("logs and continues the sweep when one conversation's flush throws, leaving pendingFlushAt set and releasing only the lease", async () => {
    const bad = makeConversation({ id: "conv_bad" });
    const ok = makeConversation({ id: "conv_ok" });
    conversationFindMany.mockResolvedValue([bad, ok]);
    stubClaimAndRelease(1);
    stubFreshLookup([bad, ok]);
    messageFindMany.mockImplementation(
      (args: { where: Record<string, unknown> }) => {
        if (
          args.where.sentBy === "customer" &&
          args.where.conversationId === "conv_bad"
        ) {
          throw new Error("boom");
        }
        if (args.where.sentBy === "customer") {
          return Promise.resolve([
            {
              id: "m1",
              content: "hola",
              mediaType: "text",
              createdAt: new Date("2026-01-01T00:00:01.000Z"),
            },
          ]);
        }
        return Promise.resolve([]);
      },
    );
    resolveAiReply.mockResolvedValue("ok");

    await sweepDueConversations();

    expect(logEvent).toHaveBeenCalledWith(
      "error",
      "ai",
      "Reply-window flush failed",
      expect.objectContaining({ conversationId: "conv_bad" }),
      business.id,
    );
    // The bad conversation's release call clears only the lease, never
    // pendingFlushAt — a later sweep must retry it.
    expect(conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: "conv_bad" },
      data: { flushLeaseUntil: null },
    });
    expect(conversationUpdateMany).not.toHaveBeenCalledWith({
      where: { id: "conv_bad", pendingFlushAt },
      data: { pendingFlushAt: null, flushLeaseUntil: null },
    });
    // The second (healthy) conversation still gets flushed despite the first
    // failing.
    expect(sendAndPersistReply).toHaveBeenCalledTimes(1);
  });

  it("does not call the AI or send a reply when the conversation was handed off to a human before the flush ran", async () => {
    const conversation = makeConversation();
    conversationFindMany.mockResolvedValue([conversation]);
    stubClaimAndRelease(1);
    // The status changed to handed_off between the message arriving and the
    // window elapsing — the fresh re-fetch must see it, not the stale
    // `status: "active"` on the conversation object the sweep first queried.
    stubFreshLookup([{ ...conversation, status: "handed_off" }]);

    await sweepDueConversations();

    expect(conversationFindUnique).toHaveBeenCalledWith({
      where: { id: "conv_1" },
      include: { business: true, phoneNumber: true },
    });
    expect(messageFindMany).not.toHaveBeenCalled();
    expect(resolveAiReply).not.toHaveBeenCalled();
    expect(sendAndPersistReply).not.toHaveBeenCalled();
    // handed_off is a "done" outcome (doFlush returns normally) — release
    // clears both markers.
    expect(conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: "conv_1", pendingFlushAt },
      data: { pendingFlushAt: null, flushLeaseUntil: null },
    });
  });

  it("does not call the AI or send a reply when the conversation is currently rate-limited, but still marks the batch consumed", async () => {
    const conversation = makeConversation();
    conversationFindMany.mockResolvedValue([conversation]);
    stubClaimAndRelease(1);
    stubFreshLookup([conversation]);
    messageFindMany.mockImplementation(
      (args: { where: Record<string, unknown> }) => {
        if (args.where.sentBy === "customer") {
          return Promise.resolve([
            {
              id: "m1",
              content: "hola",
              mediaType: "text",
              createdAt: new Date("2026-01-01T00:00:01.000Z"),
            },
          ]);
        }
        return Promise.resolve([]);
      },
    );
    isRateLimited.mockResolvedValue(true);

    await sweepDueConversations();

    expect(isRateLimited).toHaveBeenCalledWith("conv_1", "biz_1");
    // Messages are still marked consumed — the batch is skipped, not held
    // back for a future flush to double-count.
    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["m1"] } },
      data: { batchedAt: expect.any(Date) },
    });
    expect(resolveAiReply).not.toHaveBeenCalled();
    expect(sendAndPersistReply).not.toHaveBeenCalled();
  });

  it("marks the batch consumed without sending when resolveAiReply returns null (daily AI budget already notified today)", async () => {
    const conversation = makeConversation();
    conversationFindMany.mockResolvedValue([conversation]);
    stubClaimAndRelease(1);
    stubFreshLookup([conversation]);
    messageFindMany.mockImplementation(
      (args: { where: Record<string, unknown> }) => {
        if (args.where.sentBy === "customer") {
          return Promise.resolve([
            {
              id: "m1",
              content: "hola",
              mediaType: "text",
              createdAt: new Date("2026-01-01T00:00:01.000Z"),
            },
          ]);
        }
        return Promise.resolve([]);
      },
    );
    resolveAiReply.mockResolvedValue(null);

    await sweepDueConversations();

    expect(messageUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["m1"] } },
      data: { batchedAt: expect.any(Date) },
    });
    expect(sendAndPersistReply).not.toHaveBeenCalled();
  });

  it("does not send a reply when the business or phone number was deactivated before the flush ran", async () => {
    const conversation = makeConversation();
    conversationFindMany.mockResolvedValue([conversation]);
    stubClaimAndRelease(1);
    stubFreshLookup([
      { ...conversation, business: { ...business, isActive: false } },
    ]);

    await sweepDueConversations();

    expect(messageFindMany).not.toHaveBeenCalled();
    expect(resolveAiReply).not.toHaveBeenCalled();
    expect(sendAndPersistReply).not.toHaveBeenCalled();
  });

  it("does not send a reply when the phone number itself was deactivated before the flush ran", async () => {
    const conversation = makeConversation();
    conversationFindMany.mockResolvedValue([conversation]);
    stubClaimAndRelease(1);
    stubFreshLookup([
      { ...conversation, phoneNumber: { ...phoneNumber, isActive: false } },
    ]);

    await sweepDueConversations();

    expect(messageFindMany).not.toHaveBeenCalled();
    expect(resolveAiReply).not.toHaveBeenCalled();
    expect(sendAndPersistReply).not.toHaveBeenCalled();
  });

  it("selects pending messages purely by batchedAt, so a message is never dropped due to an unrelated overlapping flush's later bot-reply timestamp", async () => {
    // Regression for the message-loss race: selection is solely
    // `sentBy: "customer", batchedAt: null` — it can't be affected by any
    // bot message's timestamp.
    const conversation = makeConversation();
    conversationFindMany.mockResolvedValue([conversation]);
    stubClaimAndRelease(1);
    stubFreshLookup([conversation]);

    const customerMessage = {
      id: "m_customer",
      content: "¿siguen abiertos?",
      mediaType: "text",
      createdAt: new Date("2026-01-01T00:00:01.000Z"),
    };

    messageFindMany.mockImplementation(
      (args: { where: Record<string, unknown> }) => {
        if (args.where.sentBy === "customer") {
          expect(args.where).toEqual({
            conversationId: "conv_1",
            sentBy: "customer",
            batchedAt: null,
          });
          return Promise.resolve([customerMessage]);
        }
        return Promise.resolve([]); // history query
      },
    );
    resolveAiReply.mockResolvedValue("Respuesta");

    await sweepDueConversations();

    expect(resolveAiReply).toHaveBeenCalledTimes(1);
    const [, , , calledContent] = resolveAiReply.mock.calls[0];
    expect(calledContent).toContain("¿siguen abiertos?");
    expect(sendAndPersistReply).toHaveBeenCalledWith(
      expect.objectContaining({ id: "biz_1" }),
      expect.objectContaining({ id: "phone_1" }),
      "conv_1",
      "5215512345678",
      "Respuesta",
      "dispatch_default",
      ["m_customer"],
    );
  });
});
