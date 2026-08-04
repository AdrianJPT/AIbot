import { createHash } from "node:crypto";
import { Prisma, type Business, type PhoneNumber } from "@prisma/client";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { prisma } from "./db";
import { generateResponse } from "./ai/generate";
import { callWithAiCredential, resolveModels } from "./ai/resolve";
import { buildSystemPrompt } from "./prompt";
import {
  describeImageFromBuffer,
  downloadMediaBuffer,
  transcribeAudioBuffer,
} from "./media";
import { resolveWhatsappToken, sendFromNumber } from "./whatsapp";
import { logEvent } from "./log";

/**
 * Per-conversation abuse throttle: no Redis, single-replica Railway makes an
 * in-memory limiter viable, but a DB count survives restarts/redeploys.
 * Customer messages beyond the threshold are still persisted (nothing is
 * dropped) — only the AI call (and outbound reply) for the excess is
 * skipped, so a flood can't run up the AI bill or spam the customer back.
 */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_MESSAGES = 10;

/**
 * Per-business daily AI-call budget fallback. Hardcoded for now (see
 * docs/plan/06-hardening-extras.md §6.3) — a future pass can make this
 * configurable per business alongside businessInfo/systemPrompt.
 */
const DAILY_LIMIT_MESSAGE =
  "Estamos recibiendo muchos mensajes, en breve te responderemos.";

/**
 * Absolute cap on the debounce ceiling below, whatever `replyWindowMs` is set
 * to. A business may legitimately configure a 300s window (the admin form's
 * max), but no customer should wait five minutes for a first reply.
 */
const MAX_BATCH_AGE_CEILING_MS = 60_000;

/**
 * How long the oldest unanswered customer message may wait, at worst.
 *
 * Derived from `replyWindowMs` rather than configured separately, so a business
 * that batches for 5s tolerates a 20s worst case while one that batches for 60s
 * does not inherit a 4-minute one. Deliberately not a `Business` field: it is a
 * safety bound on an existing setting, not a second knob for operators to tune.
 */
export function maxBatchAgeMs(replyWindowMs: number): number {
  return Math.min(4 * replyWindowMs, MAX_BATCH_AGE_CEILING_MS);
}

/**
 * Due time to write to `Conversation.pendingFlushAt` for the message just
 * ingested.
 *
 * `replyWindowMs` is a debounce: every inbound message pushes the due time back
 * so a burst of bubbles collapses into one reply. Left unbounded that debounce
 * never resolves for a customer who keeps typing faster than the window — each
 * message postpones the reply again, `pendingFlushAt` stays in the future
 * forever, and the sweep never finds the conversation due. The reply is not
 * late, it never happens.
 *
 * Clamping against the oldest message still awaiting an answer bounds that
 * worst case: the reply may be late, but it always arrives. The clamp is
 * ingest-side arithmetic only — it introduces no claim, lease, or idempotency
 * primitive, and leaves `flushLeaseUntil` / `dispatchId` / `batchedAt`
 * semantics untouched.
 *
 * `oldestUnbatchedAt` is null when nothing is waiting — a concurrent flush
 * already claimed the batch, or the caller skipped the lookup because
 * `replyWindowMs` is 0. Nothing can starve, so the plain debounce applies.
 */
export function computeFlushDueAt(
  replyWindowMs: number,
  oldestUnbatchedAt: Date | null,
  now: number = Date.now(),
): Date {
  const debouncedAt = now + replyWindowMs;
  if (replyWindowMs === 0 || !oldestUnbatchedAt) return new Date(debouncedAt);

  const ceilingAt = oldestUnbatchedAt.getTime() + maxBatchAgeMs(replyWindowMs);
  return new Date(Math.min(debouncedAt, ceilingAt));
}

type WaMessage = {
  from: string;
  id?: string;
  type: string;
  text?: { body: string };
  image?: { id: string };
  audio?: { id: string };
  voice?: { id: string };
  location?: { latitude: number; longitude: number; name?: string };
  document?: { id: string; filename?: string };
  interactive?: {
    type: string;
    list_reply?: { title: string; id?: string };
    button_reply?: { title: string; id?: string };
  };
};

type WaStatus = {
  id: string; // wamid of the outbound message this status refers to
  status: string; // "sent" | "delivered" | "read" | "failed"
  errors?: Array<{ message?: string; title?: string; code?: number }>;
};

/** Statuses this app persists on Message.status; anything else is ignored. */
const KNOWN_STATUSES = new Set(["sent", "delivered", "read", "failed"]);

/**
 * Ingests one webhook payload: verifies dedupe, persists inbound messages,
 * and marks their conversations due for dispatch. Performs zero AI calls and
 * zero WhatsApp sends — that is the entire point of the ingest/dispatch
 * split (see design §3). Returns the ids of conversations this payload
 * touched, so the caller (src/lib/outbox/drain.ts) can scope the dispatch
 * sweep to exactly the conversations that might now be due, instead of
 * sweeping every business's pending work inside a request Meta is timing.
 */
export async function processWebhookPayload(body: unknown): Promise<string[]> {
  const entry = (body as { entry?: unknown[] })?.entry?.[0] as
    { changes?: unknown[] } | undefined;
  const change = entry?.changes?.[0] as
    { value?: Record<string, unknown> } | undefined;
  const value = change?.value;
  if (!value) return [];

  const metadata = value.metadata as { phone_number_id?: string } | undefined;
  const metaPhoneNumberId = metadata?.phone_number_id;
  if (!metaPhoneNumberId) return [];

  const phoneNumber = await prisma.phoneNumber.findFirst({
    where: {
      phoneNumberId: metaPhoneNumberId,
      isActive: true,
      business: { isActive: true },
    },
    include: { business: true },
  });
  if (!phoneNumber) return [];

  const { business } = phoneNumber;

  const statuses = value.statuses as WaStatus[] | undefined;
  if (statuses?.length) {
    for (const status of statuses) {
      await handleStatusUpdate(business.id, phoneNumber.id, status);
    }
  }

  const messages = value.messages as WaMessage[] | undefined;
  if (!messages?.length) return [];

  const contacts = value.contacts as
    Array<{ profile?: { name?: string }; wa_id?: string }> | undefined;

  const touchedConversationIds: string[] = [];
  for (const message of messages) {
    const customerName = contacts?.find((c) => c.wa_id === message.from)
      ?.profile?.name;
    const conversationId = await handleOneMessage(
      business,
      phoneNumber,
      message,
      customerName,
    );
    if (conversationId) touchedConversationIds.push(conversationId);
  }
  return touchedConversationIds;
}

/**
 * Applies a WhatsApp delivery status update (`sent`/`delivered`/`read`/`failed`)
 * to the outbound Message row matching `wamid`. Unknown statuses (e.g.
 * `deleted`) are ignored. `failed` statuses are logged with their error detail.
 */
async function handleStatusUpdate(
  businessId: string,
  phoneNumberId: string,
  status: WaStatus,
): Promise<void> {
  if (!status?.id || !KNOWN_STATUSES.has(status.status)) return;

  const message = await prisma.message.findFirst({
    where: { wamid: status.id },
  });
  if (!message) return;

  await prisma.message.update({
    where: { id: message.id },
    data: { status: status.status },
  });

  if (status.status === "failed") {
    await logEvent(
      "error",
      "whatsapp-send",
      "Message delivery failed",
      { wamid: status.id, errors: status.errors, messageId: message.id },
      businessId,
      phoneNumberId,
    );
  }
}

/**
 * Ingests exactly one inbound message: dedupe gate, content parsing,
 * conversation upsert, persistence — and nothing else. Cut here (not one
 * line further) so this function's scope matches the `Message.wamid`
 * @unique dedupe gate exactly: a retry that re-enters after a crash sees the
 * wamid already persisted and returns, with nothing un-sent left behind,
 * because nothing past persistence ever ran inline. See design §3.
 *
 * Returns the conversation id touched (so the caller can scope the dispatch
 * sweep), or undefined when nothing was persisted (missing `from`, dedupe
 * hit, or unparseable content).
 */
async function handleOneMessage(
  business: Business,
  phoneNumber: PhoneNumber,
  message: WaMessage,
  customerName?: string,
): Promise<string | undefined> {
  const from = message.from;
  if (!from) return undefined;

  const wamid = message.id;
  if (wamid) {
    const existing = await prisma.message.findFirst({ where: { wamid } });
    if (existing) return undefined;
  }

  const parsed = await parseUserContent(business, phoneNumber, message);
  if (!parsed) return undefined;

  const conversation = await prisma.conversation.upsert({
    where: {
      phoneNumberId_customerPhone: {
        phoneNumberId: phoneNumber.id,
        customerPhone: from,
      },
    },
    create: {
      businessId: business.id,
      phoneNumberId: phoneNumber.id,
      customerPhone: from,
      status: "active",
    },
    update: {},
  });

  if (conversation.status === "handed_off") {
    await persistCustomerMessage(conversation.id, parsed, wamid, customerName);
    return conversation.id;
  }

  await persistCustomerMessage(conversation.id, parsed, wamid, customerName);

  // Ingest's job ends here: mark the conversation due for dispatch. The
  // sweep (reply-window-scheduler.ts) picks it up — immediately, for the
  // default replyWindowMs = 0 (now() is already due), or after the debounce
  // window elapses for businesses that batch. One reply path replaces the
  // old immediate/batched split; AI generation, rate limiting, and sending
  // all now live in the sweep, never inline.
  // The anchor lookup is skipped for the default replyWindowMs = 0: with no
  // debounce there is nothing to postpone and nothing to clamp, so the webhook
  // hot path keeps exactly the query count it has today.
  const oldestUnbatchedAt =
    business.replyWindowMs === 0
      ? null
      : await findOldestUnbatchedAt(conversation.id);

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      pendingFlushAt: computeFlushDueAt(
        business.replyWindowMs,
        oldestUnbatchedAt,
      ),
    },
  });

  return conversation.id;
}

/**
 * `createdAt` of the oldest customer message in this conversation still waiting
 * for an answer, or null when none is. Runs after the current message has been
 * persisted, so on the first message of a burst it is that message itself.
 *
 * Served by the `[conversationId, sentBy, batchedAt, createdAt]` index: the
 * pre-existing `[conversationId, createdAt]` one cannot answer this cheaply,
 * because `batchedAt IS NULL` is not part of it and a forward scan would skip
 * every already-answered message in the conversation first.
 */
async function findOldestUnbatchedAt(
  conversationId: string,
): Promise<Date | null> {
  const oldest = await prisma.message.findFirst({
    where: { conversationId, sentBy: "customer", batchedAt: null },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  return oldest?.createdAt ?? null;
}

/**
 * Deterministic send-intent key for one dispatch attempt: a hash of the
 * conversation plus the exact set of customer messages being answered.
 * Stable across re-entry — a reclaimed flush re-queries the same
 * `batchedAt: null` messages and gets the same key, so a retry after a crash
 * collides on the same row instead of sending twice. A genuinely new message
 * arriving mid-flush changes the batch (and therefore the key), which is
 * correct: new content deserves a new reply, not a suppressed one.
 */
export function computeDispatchId(
  conversationId: string,
  batchedMessageIds: string[],
): string {
  const key = `${conversationId}:${[...batchedMessageIds].sort().join(",")}`;
  return createHash("sha256").update(key).digest("hex");
}

function isDispatchIdConflict(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    (Array.isArray(err.meta?.target)
      ? err.meta.target.includes("dispatchId")
      : // An unconfirmable target means we cannot prove this P2002 is the
        // dispatchId collision this catch exists to swallow. Defaulting to
        // "no, rethrow" is the safe direction: a false negative here is loud
        // (an unrelated P2002 propagates as an error, gets noticed) while a
        // false positive would silently swallow a real, actionable bug — the
        // wrong tradeoff for a defensive fallback.
        false)
  );
}

/**
 * How long a compare-and-set claim on a `Message`'s dispatch (see
 * `claimDispatch`) is held before it's eligible to be reclaimed. Same lease
 * pattern as `Conversation.flushLeaseUntil` / `WebhookEvent.leaseExpiresAt` —
 * long enough to comfortably cover one `sendFromNumber` call, short enough
 * that a stranded claim (crash mid-send) becomes reapable well within the
 * reaper's cadence. Mirrors `FLUSH_LEASE_MS` in reply-window-scheduler.ts,
 * whose rationale (history load + AI call already happened by this point;
 * only the send itself remains) applies here too.
 */
const DISPATCH_LEASE_MS = 60_000;

/**
 * How many times `reapStrandedSends` will re-attempt a stranded pending
 * send before marking it terminally "failed". Mirrors
 * `WebhookEvent.maxAttempts`'s bounded-retry convention (see
 * `outbox/repository.ts`'s `fail()`) so a permanently-unreachable number
 * doesn't get retried forever.
 */
export const MAX_DISPATCH_ATTEMPTS = 5;

/**
 * How old a `status: "pending"` assistant message must be (with no claim
 * lease in flight) before the reaper will touch it. Wide margin over
 * `DISPATCH_LEASE_MS` / the flush lease (60s) / the outbox lease (90s), so
 * the reaper never contends with a legitimately in-flight first attempt —
 * it only ever picks up rows that are genuinely stranded.
 */
const REAP_STALE_MS = 5 * 60_000;

/**
 * Compare-and-set claim on a `Message`'s dispatch lease. This is the single
 * choke point that makes finishing a "pending" send crash-safe and
 * race-safe: `sendAndPersistReply`'s own happy path (right after it creates
 * the row), its P2002-conflict "someone else already committed this
 * dispatchId" resume path, and the periodic `reapStrandedSends` sweep all
 * funnel through here, so no two of them can ever call `sendFromNumber` for
 * the same row concurrently — see dispatch-resumability.test.ts's
 * concurrent-race and reaper coverage. A claim miss (lease already held and
 * not yet expired) is a silent no-op: another caller is already handling,
 * or already handled, this row.
 */
async function claimDispatch(messageId: string): Promise<boolean> {
  const now = new Date();
  const claim = await prisma.message.updateMany({
    where: {
      id: messageId,
      status: "pending",
      wamid: null,
      OR: [{ dispatchLeaseUntil: null }, { dispatchLeaseUntil: { lt: now } }],
    },
    data: {
      dispatchAttempts: { increment: 1 },
      dispatchLeaseUntil: new Date(now.getTime() + DISPATCH_LEASE_MS),
    },
  });
  return claim.count === 1;
}

/**
 * Claims and sends a reply exactly once: on failure this marks the row
 * terminally "failed" immediately, with no retry — used for the first,
 * live attempt at a send (fresh creation, or a same-request resume of a
 * conflicting `dispatchId`), where a thrown error is a genuine response
 * from `sendFromNumber`, not the crash-mid-flight ambiguity the reaper
 * exists to resolve. Bounded-retry-with-backoff for the ambiguous case
 * lives in `reapStrandedSends` instead.
 */
async function claimAndSendOnce(
  messageId: string,
  content: string,
  business: Business,
  phoneNumber: PhoneNumber,
  from: string,
  conversationId: string,
): Promise<void> {
  if (!(await claimDispatch(messageId))) return;

  try {
    const wamid = await sendFromNumber(
      phoneNumber,
      business.ownerId,
      from,
      content,
    );
    await prisma.message.update({
      where: { id: messageId },
      data: wamid ? { wamid, status: "sent" } : { status: "sent" },
    });
  } catch (err) {
    await logEvent(
      "error",
      "whatsapp-send",
      "sendMessage failed",
      { error: describeError(err), conversationId },
      business.id,
      phoneNumber.id,
    );
    await prisma.message.update({
      where: { id: messageId },
      data: { status: "failed" },
    });
  }
}

/**
 * Bounded-retry counterpart of `claimAndSendOnce`, used only by
 * `reapStrandedSends`. A failure here doesn't necessarily mean the row is
 * unrecoverable — it might just be a transient WhatsApp API blip on a
 * message we already don't know the true outcome of — so it retries up to
 * `MAX_DISPATCH_ATTEMPTS` claims before giving up and marking "failed".
 * Between attempts, no explicit backoff bookkeeping is needed: the lease
 * `claimDispatch` sets naturally gates the next reap attempt until it
 * expires.
 */
async function claimAndRetrySend(
  message: { id: string; content: string; dispatchAttempts: number },
  business: Business,
  phoneNumber: PhoneNumber,
  from: string,
  conversationId: string,
): Promise<void> {
  if (!(await claimDispatch(message.id))) return;
  const attempts = message.dispatchAttempts + 1;

  try {
    const wamid = await sendFromNumber(
      phoneNumber,
      business.ownerId,
      from,
      message.content,
    );
    await prisma.message.update({
      where: { id: message.id },
      data: wamid ? { wamid, status: "sent" } : { status: "sent" },
    });
  } catch (err) {
    await logEvent(
      "error",
      "whatsapp-send",
      "Reaper resend attempt failed",
      {
        error: describeError(err),
        conversationId,
        messageId: message.id,
        attempts,
      },
      business.id,
      phoneNumber.id,
    );
    if (attempts >= MAX_DISPATCH_ATTEMPTS) {
      await prisma.message.update({
        where: { id: message.id },
        data: { status: "failed" },
      });
    }
    // Otherwise leave status "pending": the lease claimDispatch just set
    // gates the next reap attempt until it expires, so this row is retried
    // on a later drain tick rather than immediately looping.
  }
}

/**
 * Bounded reaper for outbound sends stranded by a crash between
 * `sendAndPersistReply`'s persistence transaction (which commits
 * `batchedAt` on the answered customer messages and creates the assistant
 * row `status: "pending"`) and the network call actually resolving. Once
 * that transaction commits, those customer messages and that conversation
 * never look stale again — `doFlush`'s `batchedAt: null` query finds
 * nothing on a later sweep, so this is the only path that can ever recover
 * the reply. See design/verify-report's CRITICAL #1 for the full
 * crash-window analysis.
 *
 * Only ever invoked from the unscoped (scheduled/dev-ticker) drain path —
 * see outbox/drain.ts — never from the inline webhook path, to keep the
 * webhook's 12s budget free of unrelated stranded-message work.
 */
export async function reapStrandedSends(): Promise<void> {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - REAP_STALE_MS);

  const stranded = await prisma.message.findMany({
    where: {
      sentBy: "bot",
      status: "pending",
      wamid: null,
      dispatchAttempts: { lt: MAX_DISPATCH_ATTEMPTS },
      OR: [
        { dispatchLeaseUntil: { lt: now } },
        {
          AND: [
            { dispatchLeaseUntil: null },
            { createdAt: { lte: staleCutoff } },
          ],
        },
      ],
    },
    include: {
      conversation: { include: { business: true, phoneNumber: true } },
    },
  });

  for (const message of stranded) {
    const { conversation } = message;
    if (!conversation) continue;
    await claimAndRetrySend(
      message,
      conversation.business,
      conversation.phoneNumber,
      conversation.customerPhone,
      conversation.id,
    );
  }
}

/**
 * Persists the bot's reply as a Message row, marks the batched customer
 * messages consumed, and bumps the conversation's lastMessageAt — all in one
 * transaction — then sends over WhatsApp and flips the reply to "sent"
 * (recording the wamid) or "failed". Only the reply-window scheduler calls
 * this now (see reply-window-scheduler.ts's doFlush); the ingest path never
 * sends.
 *
 * The assistant row is created `status: "pending"` (not the schema default
 * "sent") so a crash between this transaction and the send call is
 * observable as `role: assistant AND status: 'pending' AND wamid IS NULL`,
 * not indistinguishable from a delivered message.
 *
 * `dispatchId` is the no-double-send guard: if a prior attempt (the inline
 * path, or an earlier sweep tick before its crash) already got this far, the
 * unique constraint on `Message.dispatchId` rejects this transaction with
 * P2002. That is not automatically "don't send" — only a prior attempt that
 * actually reached a terminal state ("sent"/"failed") is a genuine
 * duplicate. A prior attempt still `status: "pending"` means its
 * persistence committed but the send itself never finished (a live race, or
 * a stranded crash) — see `claimAndSendOnce`, which this falls through to.
 * The actual send/flip-to-terminal logic (and its exclusivity guarantee
 * against a concurrent claimer) lives in `claimDispatch`/`claimAndSendOnce`,
 * shared with the periodic `reapStrandedSends` reaper — see CRITICAL #1 in
 * `sdd/webhook-outbox/verify-report` for why this exists.
 */
export async function sendAndPersistReply(
  business: Business,
  phoneNumber: PhoneNumber,
  conversationId: string,
  from: string,
  reply: string,
  dispatchId: string,
  batchedMessageIds: string[],
): Promise<void> {
  let outboundMessage: { id: string };
  try {
    [outboundMessage] = await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId,
          role: "assistant",
          content: reply,
          mediaType: "text",
          sentBy: "bot",
          status: "pending",
          dispatchId,
        },
      }),
      prisma.message.updateMany({
        where: { id: { in: batchedMessageIds } },
        data: { batchedAt: new Date() },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);
  } catch (err) {
    if (isDispatchIdConflict(err)) {
      await logEvent(
        "error",
        "whatsapp-send",
        "Duplicate dispatch blocked by dispatchId uniqueness",
        { conversationId, dispatchId },
        business.id,
        phoneNumber.id,
      );

      // A completed prior attempt ("sent" or terminally "failed") is a
      // genuine duplicate — nothing to do. But a row that's still
      // "pending"/unsent means the prior attempt committed its persistence
      // transaction and never finished sending — it may be racing us right
      // now, or it may already be stranded by a crash. Either way, "assume
      // it already sent" was the CRITICAL bug: race to claim and finish it
      // instead. claimDispatch's lease makes this safe even if the winner
      // of the original race is mid-send at this exact moment.
      const existing = await prisma.message.findUnique({
        where: { dispatchId },
      });
      if (existing && existing.status === "pending" && !existing.wamid) {
        await claimAndSendOnce(
          existing.id,
          existing.content,
          business,
          phoneNumber,
          from,
          conversationId,
        );
      }
      return;
    }
    throw err;
  }

  await claimAndSendOnce(
    outboundMessage.id,
    reply,
    business,
    phoneNumber,
    from,
    conversationId,
  );
}

/**
 * Per-conversation abuse throttle. Counts customer messages within the last
 * `RATE_LIMIT_WINDOW_MS` (including the one just persisted) — if it exceeds
 * `RATE_LIMIT_MAX_MESSAGES`, the caller should skip AI generation for this
 * message. The message itself is always persisted regardless of this check.
 */
export async function isRateLimited(
  conversationId: string,
  businessId: string,
): Promise<boolean> {
  const recentCustomerCount = await prisma.message.count({
    where: {
      conversationId,
      sentBy: "customer",
      createdAt: { gte: new Date(Date.now() - RATE_LIMIT_WINDOW_MS) },
    },
  });

  if (recentCustomerCount <= RATE_LIMIT_MAX_MESSAGES) return false;

  await logEvent(
    "warn",
    "webhook",
    "Per-conversation rate limit exceeded, skipping AI generation",
    { conversationId, recentCustomerCount },
    businessId,
  );
  return true;
}

/**
 * Resolves the bot's reply respecting the per-business daily AI-call budget
 * (`Business.dailyAiLimit`). The budget is counted as bot-authored Message
 * rows created since UTC midnight for the business — simplest option that
 * needs no extra counter column and self-resets daily via `createdAt`.
 *
 * When the budget is exhausted, the canned Spanish notice is sent exactly
 * once per day (checked by looking for a prior bot message with that exact
 * content today) — subsequent messages that day get no reply at all, to
 * avoid spamming the customer.
 */
export async function resolveAiReply(
  business: Business,
  conversationId: string,
  history: ChatCompletionMessageParam[],
  content: string,
): Promise<string | null> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const aiCallsToday = await prisma.message.count({
    where: {
      sentBy: "bot",
      createdAt: { gte: startOfDay },
      conversation: { businessId: business.id },
    },
  });

  if (aiCallsToday >= business.dailyAiLimit) {
    const alreadyNotifiedToday = await prisma.message.findFirst({
      where: {
        sentBy: "bot",
        content: DAILY_LIMIT_MESSAGE,
        createdAt: { gte: startOfDay },
        conversation: { businessId: business.id },
      },
    });

    if (alreadyNotifiedToday) {
      await logEvent(
        "warn",
        "ai",
        "Daily AI budget exceeded, staying silent (already notified today)",
        { businessId: business.id, aiCallsToday },
        business.id,
      );
      return null;
    }

    await logEvent(
      "warn",
      "ai",
      "Daily AI budget exceeded, sending fallback message",
      { businessId: business.id, aiCallsToday },
      business.id,
    );
    return DAILY_LIMIT_MESSAGE;
  }

  try {
    const systemPrompt = buildSystemPrompt(business);
    const { chatModel } = await resolveModels(business);
    return await callWithAiCredential(business, (client) =>
      generateResponse(client, systemPrompt, history, content, chatModel),
    );
  } catch (err) {
    await logEvent(
      "error",
      "ai",
      "generateResponse failed",
      { error: describeError(err), conversationId },
      business.id,
    );
    return null;
  }
}

/**
 * Persists a customer-originated message and bumps the conversation's
 * denormalized list fields (lastMessageAt, unreadCount, customerName) in a
 * single transaction so the two never drift apart.
 */
async function persistCustomerMessage(
  conversationId: string,
  parsed: { content: string; mediaType: string },
  wamid: string | undefined,
  customerName: string | undefined,
): Promise<void> {
  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        role: "user",
        content: parsed.content,
        mediaType: parsed.mediaType,
        wamid,
        sentBy: "customer",
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },
        ...(customerName && { customerName }),
      },
    }),
  ]);
}

function describeError(err: unknown): {
  message: string;
  stack?: string;
  code?: string;
} {
  // AI provider errors (e.g. openai's APIError) expose `code`/`type` as
  // top-level properties — surfacing it here means a 429/401/403 shows up
  // in the EventLog even though the caller (resolveAiReply) only sees the
  // generic Error thrown after resolve.ts's retry/failover bookkeeping.
  const code =
    (err as { code?: string | null; type?: string | null })?.code ??
    (err as { code?: string | null; type?: string | null })?.type ??
    undefined;
  const base =
    err instanceof Error
      ? { message: err.message, stack: err.stack }
      : { message: String(err) };
  return code ? { ...base, code } : base;
}

async function parseUserContent(
  business: Business,
  phoneNumber: PhoneNumber,
  message: WaMessage,
): Promise<{ content: string; mediaType: string } | null> {
  switch (message.type) {
    case "text":
      return {
        content: message.text?.body || "",
        mediaType: "text",
      };
    case "interactive": {
      const t =
        message.interactive?.list_reply?.title ||
        message.interactive?.button_reply?.title ||
        "";
      return { content: t || "[Interactivo sin texto]", mediaType: "text" };
    }
    case "image": {
      const id = message.image?.id;
      if (!id) return null;
      try {
        const token = await resolveWhatsappToken(phoneNumber, business.ownerId);
        const { buffer, mimeType } = await downloadMediaBuffer(id, token);
        const desc = await describeImageFromBuffer(business, buffer, mimeType);
        return {
          content: `[Imagen del cliente] ${desc}`,
          mediaType: "image",
        };
      } catch (err) {
        await logEvent(
          "error",
          "ai",
          "describeImageFromBuffer failed",
          { error: describeError(err) },
          business.id,
          phoneNumber.id,
        );
        return {
          content: "[Imagen del cliente — no se pudo procesar]",
          mediaType: "image",
        };
      }
    }
    case "audio":
    case "voice": {
      const id = message.audio?.id || message.voice?.id;
      if (!id) return null;
      try {
        const token = await resolveWhatsappToken(phoneNumber, business.ownerId);
        const { buffer } = await downloadMediaBuffer(id, token);
        const text = await transcribeAudioBuffer(business, buffer);
        return { content: `[Audio del cliente] ${text}`, mediaType: "audio" };
      } catch (err) {
        await logEvent(
          "error",
          "ai",
          "transcribeAudioBuffer failed",
          { error: describeError(err) },
          business.id,
          phoneNumber.id,
        );
        return {
          content: "[Audio del cliente — no se pudo transcribir]",
          mediaType: "audio",
        };
      }
    }
    case "location": {
      const loc = message.location;
      if (!loc) return null;
      const name = loc.name ? ` (${loc.name})` : "";
      return {
        content: `El cliente envió su ubicación: ${loc.latitude}, ${loc.longitude}${name}`,
        mediaType: "location",
      };
    }
    case "document":
      return { content: "[Documento adjunto]", mediaType: "document" };
    default:
      return null;
  }
}
