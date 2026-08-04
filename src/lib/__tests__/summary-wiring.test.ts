import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildBusiness, buildPhoneNumber } from "./fixtures/business";
import type { ConversationSummary } from "../ai/summarize";

const conversationFindMany = vi.fn();
const conversationUpdateMany = vi.fn();
const conversationFindUnique = vi.fn();
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

// The real summarize.ts runs against a fake client: validation, capping and
// rendering are all exercised for real, and only the provider is stubbed.
const summarizerCreate = vi.fn();
vi.mock("../ai/resolve", () => ({
  callWithAiCredential: (_b: unknown, fn: (c: unknown) => unknown) =>
    fn({ chat: { completions: { create: summarizerCreate } } }),
  resolveModels: async () => ({
    chatModel: "gpt-4o-mini",
    visionModel: "gpt-4o-mini",
    audioModel: "whisper-1",
  }),
}));

const { sweepDueConversations } = await import("../reply-window-scheduler");

const business = buildBusiness({ replyWindowMs: 30_000 });
const phoneNumber = buildPhoneNumber({ phoneNumberId: "PHONE_ID" });

const SUMMARIZED_THROUGH = new Date("2026-01-01T00:00:00.000Z");
const PENDING_AT = new Date("2026-01-01T01:00:00.000Z");

const STORED: ConversationSummary = {
  customerName: "Sofía",
  preferences: ["Celíaca"],
  commitments: [],
  openItems: ["Espera el precio del catering"],
  facts: [],
  notes: null,
};

function conversation(overrides: Record<string, unknown> = {}) {
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
    pendingFlushAt: PENDING_AT,
    flushLeaseUntil: null,
    summary: null,
    summarizedThroughAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    business,
    phoneNumber,
    ...overrides,
  };
}

/**
 * The pending batch, the history tail and the summarizer transcript all come
 * through prisma.message.findMany. They are told apart by the only thing that
 * genuinely distinguishes them: the pending query filters `batchedAt: null`, the
 * tail is the one bounded by an upper `lt` on createdAt, and the transcript has
 * no upper bound at all.
 */
function routeMessageQueries(opts: {
  historyTail?: unknown[];
  sinceCount?: number;
}) {
  messageFindMany.mockImplementation(
    (args: { where: Record<string, unknown>; take?: number }) => {
      if (args.where.batchedAt === null) {
        return Promise.resolve([
          {
            id: "msg_1",
            content: "y el precio final?",
            mediaType: "text",
            sentBy: "customer",
            createdAt: PENDING_AT,
          },
        ]);
      }

      const createdAt = args.where.createdAt as { lt?: Date } | undefined;
      if (createdAt?.lt) return Promise.resolve(opts.historyTail ?? []);

      // Transcript: oldest-first, matching production's ascending order, and
      // honouring `take` — the cap is exactly what the no-hole guarantee rests
      // on, so a mock that ignored it would make that test vacuous.
      const all = Array.from({ length: opts.sinceCount ?? 0 }, (_, i) => ({
        id: `t_${i}`,
        content: `mensaje ${i}`,
        sentBy: i % 2 === 0 ? "customer" : "bot",
        createdAt: new Date(SUMMARIZED_THROUGH.getTime() + (i + 1) * 1_000),
      }));
      return Promise.resolve(args.take ? all.slice(0, args.take) : all);
    },
  );
}

/** The transcript query: the message findMany with no upper createdAt bound. */
function transcriptQuery() {
  return messageFindMany.mock.calls.find(
    (c) =>
      c[0]?.where?.batchedAt !== null &&
      !(c[0]?.where?.createdAt as { lt?: Date } | undefined)?.lt,
  );
}

function historyOf(): Array<{ role: string; content: string }> {
  return resolveAiReply.mock.calls[0][2];
}

/** The `where` of the descending history-tail query. */
function tailWhere(): Record<string, unknown> {
  const call = messageFindMany.mock.calls.find(
    (c) =>
      c[0]?.where?.batchedAt !== null &&
      JSON.stringify(c[0]?.orderBy) === JSON.stringify({ createdAt: "desc" }),
  );
  return call![0].where;
}

beforeEach(() => {
  vi.clearAllMocks();
  conversationUpdateMany.mockResolvedValue({ count: 1 });
  messageUpdateMany.mockResolvedValue({ count: 1 });
  isRateLimited.mockResolvedValue(false);
  computeDispatchId.mockReturnValue("dispatch_1");
  resolveAiReply.mockResolvedValue("respuesta");
  sendAndPersistReply.mockResolvedValue(undefined);
  routeMessageQueries({});
});

async function sweep(conv: Record<string, unknown>) {
  conversationFindMany.mockResolvedValue([conv]);
  conversationFindUnique.mockResolvedValue(conv);
  await sweepDueConversations({ conversationIds: ["conv_1"] });
}

describe("summary in the prompt history", () => {
  it("prepends the stored summary as fenced user content", async () => {
    await sweep(
      conversation({
        summary: STORED,
        summarizedThroughAt: SUMMARIZED_THROUGH,
      }),
    );

    const first = historyOf()[0];
    // User role, not system: the summary is model-generated text derived from
    // customer messages, so it is untrusted however structured it looks.
    expect(first.role).toBe("user");
    expect(first.content).toMatch(
      /^\[INICIO RESUMEN DE LA CONVERSACIÓN [0-9a-f]{16}\]/,
    );
    expect(first.content).toContain("Cliente: Sofía");
    expect(first.content).toContain("Preferencias: Celíaca");
    expect(first.content).toContain("Pendiente: Espera el precio del catering");
  });

  it("bounds the raw tail to messages after the watermark", async () => {
    await sweep(
      conversation({
        summary: STORED,
        summarizedThroughAt: SUMMARIZED_THROUGH,
      }),
    );

    expect(tailWhere().createdAt).toEqual({
      lt: PENDING_AT,
      gt: SUMMARIZED_THROUGH,
    });
  });

  it("keeps the raw-history cap even with a summary present", async () => {
    await sweep(
      conversation({
        summary: STORED,
        summarizedThroughAt: SUMMARIZED_THROUGH,
      }),
    );

    const call = messageFindMany.mock.calls.find(
      (c) =>
        JSON.stringify(c[0]?.orderBy) === JSON.stringify({ createdAt: "desc" }),
    );
    // The summary remembers things older than the window; it does not widen it.
    expect(call![0].take).toBe(business.maxHistoryMessages);
  });

  it("falls back to unbounded raw history when there is no summary", async () => {
    await sweep(conversation());

    expect(tailWhere().createdAt).toEqual({ lt: PENDING_AT });
    expect(historyOf()[0]).toBeUndefined();
  });

  it("ignores the stored summary entirely when summaryEnabled is false", async () => {
    await sweep(
      conversation({
        summary: STORED,
        summarizedThroughAt: SUMMARIZED_THROUGH,
        business: { ...business, summaryEnabled: false },
      }),
    );

    expect(tailWhere().createdAt).toEqual({ lt: PENDING_AT });
    expect(historyOf().some((m) => m.content.includes("Sofía"))).toBe(false);
    expect(summarizerCreate).not.toHaveBeenCalled();
  });

  it("re-validates on read, so a corrupt row degrades to raw history", async () => {
    // Prisma types the column as Json, so a row written by hand or left by an
    // older deploy can be any shape at all. It must not reach the prompt.
    await sweep(
      conversation({
        summary: {
          customerName: { nested: "objeto" },
          preferences: "no-array",
        },
        summarizedThroughAt: SUMMARIZED_THROUGH,
      }),
    );

    expect(tailWhere().createdAt).toEqual({ lt: PENDING_AT });
    expect(historyOf()[0]).toBeUndefined();
  });
});

describe("post-send summary regeneration", () => {
  const NEW_SUMMARY = {
    customerName: "Sofía",
    preferences: ["Celíaca"],
    commitments: ["Precio del catering enviado"],
    openItems: [],
    facts: [],
    notes: null,
  };

  function summarizerReturns(body: unknown) {
    summarizerCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(body) } }],
    });
  }

  it("does not summarize below the per-business threshold", async () => {
    routeMessageQueries({ sinceCount: business.summaryEveryNMessages - 1 });
    await sweep(conversation({ summarizedThroughAt: SUMMARIZED_THROUGH }));

    expect(sendAndPersistReply).toHaveBeenCalledTimes(1);
    expect(summarizerCreate).not.toHaveBeenCalled();
  });

  it("summarizes once the threshold is reached, and only after the reply", async () => {
    routeMessageQueries({ sinceCount: business.summaryEveryNMessages });
    summarizerReturns(NEW_SUMMARY);

    await sweep(conversation({ summarizedThroughAt: SUMMARIZED_THROUGH }));

    expect(sendAndPersistReply).toHaveBeenCalledTimes(1);
    expect(summarizerCreate).toHaveBeenCalledTimes(1);
    // The reply went out before the summarizer was ever called.
    expect(sendAndPersistReply.mock.invocationCallOrder[0]).toBeLessThan(
      summarizerCreate.mock.invocationCallOrder[0],
    );
  });

  it("persists the new summary behind a monotonic compare-and-set", async () => {
    routeMessageQueries({ sinceCount: business.summaryEveryNMessages });
    summarizerReturns(NEW_SUMMARY);

    await sweep(conversation({ summarizedThroughAt: SUMMARIZED_THROUGH }));

    const write = conversationUpdateMany.mock.calls.find(
      (c) => c[0]?.data?.summary !== undefined,
    );
    expect(write).toBeTruthy();
    // Only advances the watermark, never rewinds it: an overlapping flush that
    // finishes second must not hide messages its older summary never described.
    expect(write![0].where.OR).toEqual([
      { summarizedThroughAt: null },
      { summarizedThroughAt: { lt: expect.any(Date) } },
    ]);
    expect(write![0].data.summary).toMatchObject({ customerName: "Sofía" });
  });

  it("logs and keeps raw history when the summarizer returns nothing usable", async () => {
    routeMessageQueries({ sinceCount: business.summaryEveryNMessages });
    summarizerCreate.mockResolvedValue({
      choices: [{ message: { content: "no es JSON" } }],
    });

    await sweep(conversation({ summarizedThroughAt: SUMMARIZED_THROUGH }));

    // The customer still got their reply — that is the invariant that matters.
    expect(sendAndPersistReply).toHaveBeenCalledTimes(1);
    expect(
      conversationUpdateMany.mock.calls.some((c) => c[0]?.data?.summary),
    ).toBe(false);
    expect(
      logEvent.mock.calls.some((c) => c[0] === "warn" && c[1] === "ai-summary"),
    ).toBe(true);
  });

  it("logs when its write loses the race and is discarded", async () => {
    routeMessageQueries({ sinceCount: business.summaryEveryNMessages });
    summarizerReturns(NEW_SUMMARY);
    conversationUpdateMany.mockImplementation(
      (args: { data: { summary?: unknown } }) =>
        Promise.resolve({ count: args.data?.summary ? 0 : 1 }),
    );

    await sweep(conversation({ summarizedThroughAt: SUMMARIZED_THROUGH }));

    expect(
      logEvent.mock.calls.some((c) => c[0] === "info" && c[1] === "ai-summary"),
    ).toBe(true);
  });

  it("never lets a summarizer failure fail the flush", async () => {
    routeMessageQueries({ sinceCount: business.summaryEveryNMessages });
    summarizerCreate.mockRejectedValue(new Error("OpenAI is down"));

    await expect(
      sweep(conversation({ summarizedThroughAt: SUMMARIZED_THROUGH })),
    ).resolves.toBeUndefined();
    expect(sendAndPersistReply).toHaveBeenCalledTimes(1);
  });

  it("treats a non-positive threshold as 1 instead of summarizing every flush", async () => {
    // summaryEveryNMessages is an unconstrained Int. At 0 the naive guard
    // `rows.length < 0` is never true, so every reply would pay for a
    // summarization call — a cadence of "always".
    routeMessageQueries({ sinceCount: 0 });
    summarizerReturns(NEW_SUMMARY);

    await sweep(
      conversation({ business: { ...business, summaryEveryNMessages: 0 } }),
    );

    // Nothing accumulated, so nothing to summarize — the clamp turned the
    // threshold into 1 rather than into "no threshold".
    expect(summarizerCreate).not.toHaveBeenCalled();
  });

  it("summarizes at a clamped threshold of 1 once a single message exists", async () => {
    routeMessageQueries({ sinceCount: 1 });
    summarizerReturns(NEW_SUMMARY);

    await sweep(
      conversation({ business: { ...business, summaryEveryNMessages: -5 } }),
    );

    expect(summarizerCreate).toHaveBeenCalledTimes(1);
  });

  it("caps the transcript so a first summarization cannot send a whole history", async () => {
    routeMessageQueries({ sinceCount: business.summaryEveryNMessages });
    summarizerReturns(NEW_SUMMARY);

    // No watermark: this is the unbounded case, the only one where the cap binds.
    await sweep(conversation({ summarizedThroughAt: null }));

    const query = transcriptQuery();
    expect(query).toBeTruthy();
    expect(query![0].take).toBe(100);
  });

  it("summarizes only after the flush lease has been released", async () => {
    routeMessageQueries({ sinceCount: business.summaryEveryNMessages });
    summarizerReturns(NEW_SUMMARY);

    await sweep(conversation({ summarizedThroughAt: SUMMARIZED_THROUGH }));

    // The lease release is the updateMany that nulls flushLeaseUntil. It has to
    // land before the summarizer runs, or a second awaited AI call would sit
    // inside a 60s lease justified on the basis of one.
    const release = conversationUpdateMany.mock.calls.find(
      (c) => c[0]?.data?.flushLeaseUntil === null,
    );
    expect(release).toBeTruthy();
    const releaseOrder =
      conversationUpdateMany.mock.invocationCallOrder[
        conversationUpdateMany.mock.calls.indexOf(release!)
      ];
    expect(releaseOrder).toBeLessThan(
      summarizerCreate.mock.invocationCallOrder[0],
    );
  });

  it("does not summarize when the flush was rate-limited into sending nothing", async () => {
    // The `if (sent)` guard is the whole point of moving summarization out of
    // doFlush: a flush that never replied has nothing new worth summarizing, and
    // paying for a call anyway would be the cost bug in a different costume.
    routeMessageQueries({ sinceCount: business.summaryEveryNMessages });
    summarizerReturns(NEW_SUMMARY);
    isRateLimited.mockResolvedValue(true);

    await sweep(conversation({ summarizedThroughAt: SUMMARIZED_THROUGH }));

    expect(sendAndPersistReply).not.toHaveBeenCalled();
    expect(summarizerCreate).not.toHaveBeenCalled();
  });

  it("does not summarize when the reply resolver declined to answer", async () => {
    // resolveAiReply returns null on the daily-budget path, among others.
    routeMessageQueries({ sinceCount: business.summaryEveryNMessages });
    summarizerReturns(NEW_SUMMARY);
    resolveAiReply.mockResolvedValue(null);

    await sweep(conversation({ summarizedThroughAt: SUMMARIZED_THROUGH }));

    expect(sendAndPersistReply).not.toHaveBeenCalled();
    expect(summarizerCreate).not.toHaveBeenCalled();
  });

  it("does not summarize when there was nothing pending to reply to", async () => {
    messageFindMany.mockResolvedValue([]);
    summarizerReturns(NEW_SUMMARY);

    await sweep(conversation({ summarizedThroughAt: SUMMARIZED_THROUGH }));

    expect(sendAndPersistReply).not.toHaveBeenCalled();
    expect(summarizerCreate).not.toHaveBeenCalled();
  });

  it("reads the transcript oldest-first from the watermark, never newest-first", async () => {
    // Newest-first is what leaves a hole: summarization runs after this flush's
    // batch and reply are persisted, so a newest-N window sits ahead of the tail
    // the reply was built from, and the messages in between would end up in
    // neither the summary nor any future tail.
    routeMessageQueries({ sinceCount: business.summaryEveryNMessages });
    summarizerReturns(NEW_SUMMARY);

    await sweep(conversation({ summarizedThroughAt: SUMMARIZED_THROUGH }));

    const query = transcriptQuery()!;
    expect(query[0].orderBy).toEqual({ createdAt: "asc" });
    expect(query[0].take).toBe(100);
    expect(query[0].where.createdAt).toEqual({ gt: SUMMARIZED_THROUGH });
  });

  it("advances the watermark only over messages the transcript actually covered", async () => {
    // The no-hole guarantee, stated as an assertion: with a backlog larger than
    // the cap, the watermark must stop at the newest message summarized, not jump
    // to the newest message in the table.
    const backlog = 250;
    routeMessageQueries({ sinceCount: backlog });
    summarizerReturns(NEW_SUMMARY);

    await sweep(conversation({ summarizedThroughAt: SUMMARIZED_THROUGH }));

    const write = conversationUpdateMany.mock.calls.find(
      (c) => c[0]?.data?.summary !== undefined,
    )!;
    const capped = new Date(SUMMARIZED_THROUGH.getTime() + 100 * 1_000);
    const newestInTable = new Date(
      SUMMARIZED_THROUGH.getTime() + backlog * 1_000,
    );
    expect(write[0].data.summarizedThroughAt).toEqual(capped);
    expect(write[0].data.summarizedThroughAt).not.toEqual(newestInTable);
  });

  it("skips summarization entirely when the business disabled it", async () => {
    routeMessageQueries({ sinceCount: business.summaryEveryNMessages * 3 });
    await sweep(
      conversation({ business: { ...business, summaryEnabled: false } }),
    );

    expect(summarizerCreate).not.toHaveBeenCalled();
  });
});
