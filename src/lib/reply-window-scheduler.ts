import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Business, Conversation, PhoneNumber } from "@prisma/client";
import { prisma } from "./db";
import {
  computeDispatchId,
  isRateLimited,
  resolveAiReply,
  sendAndPersistReply,
} from "./message-handler";
import { logEvent } from "./log";
import {
  renderUntrustedBlock,
  sanitizeUntrusted,
  truncateChars,
} from "./prompt";
import { callWithAiCredential, resolveModels } from "./ai/resolve";
import {
  readConversationSummary,
  renderConversationSummary,
  summarizeConversation,
} from "./ai/summarize";

/**
 * How long a conversation's dispatch claim (`flushLeaseUntil`) stays held
 * before it's eligible for reclaim by a later sweep tick — see
 * flushDueConversation's claim step. Strictly smaller worst case than the
 * outbox's 90s lease (repository.ts): parsing already happened at ingest, so
 * a flush is only history load + AI call + send. 2x headroom over the
 * credential-chain failover worst case (~30s, see design §2).
 *
 * That "one AI call" is load-bearing, so keep it true. Summarization is a second
 * AI call and it deliberately runs *outside* this lease, in flushDueConversation
 * after the release — see the note there. Moving it back inside would silently
 * invalidate this number, and a slow provider could then let the lease expire
 * while the flush is still running, which is the concurrent double-flush the
 * lease exists to prevent. If you ever add another awaited call to the flush
 * path, either keep it outside the lease or raise this constant on purpose.
 */
const FLUSH_LEASE_MS = 60_000;

/**
 * Most messages fed to the summarizer in one call.
 *
 * Only binds on a conversation's first summarization, which has no watermark to
 * start from and would otherwise send its whole history at once. Afterwards the
 * watermark keeps each transcript to whatever arrived since the last one.
 */
const MAX_SUMMARY_TRANSCRIPT_MESSAGES = 100;

/**
 * Framing string prepended to the batched JSON payload so the model treats
 * the array as consecutive messages from one customer to answer together,
 * not as unrelated turns. Not shown to the customer — it's content framing
 * for the AI only, same content-role slot as a normal user message.
 */
const BATCH_INSTRUCTION =
  'El cliente envió varios mensajes seguidos, en este orden (ver "n"). ' +
  "Respondelos todos juntos, en una sola respuesta:\n";

const DOCUMENT_FALLBACK_REPLY =
  "Por ahora no puedo leer archivos o documentos. ¿Puedes escribir tu consulta en un mensaje de texto?";

type DueConversation = Conversation & {
  business: Business;
  phoneNumber: PhoneNumber;
};

/**
 * Sweeps every conversation whose `pendingFlushAt` has elapsed and flushes
 * each one. This is the entire dispatch path now — the ingest side
 * (message-handler.ts) never calls the AI or sends. Called both by the
 * external drain endpoint (unscoped, replacing the old `setInterval`) and,
 * scoped via `conversationIds`, by the inline webhook path right after
 * ingest — see src/lib/outbox/drain.ts.
 *
 * Scoping matters: an unscoped sweep inside a webhook request would flush
 * *other businesses'* conversations too and add unbounded latency to a
 * request Meta is timing.
 */
export async function sweepDueConversations(
  opts: { conversationIds?: string[] } = {},
): Promise<void> {
  const due = await prisma.conversation.findMany({
    where: {
      pendingFlushAt: { lte: new Date() },
      ...(opts.conversationIds ? { id: { in: opts.conversationIds } } : {}),
    },
    include: { business: true, phoneNumber: true },
  });

  for (const conversation of due as DueConversation[]) {
    try {
      await flushDueConversation(conversation);
    } catch (err) {
      await logEvent(
        "error",
        "ai",
        "Reply-window flush failed",
        {
          error: err instanceof Error ? err.message : String(err),
          conversationId: conversation.id,
        },
        conversation.businessId,
      );
    }
  }
}

/**
 * Claims a due conversation with a lease (not a destructive null-out),
 * flushes it, and releases the lease. Fixes the orphan bug: previously the
 * claim set `pendingFlushAt: null` with no expiry, so a crash between claim
 * and send lost the conversation's pending messages forever — the due query
 * would never see it again. Now `pendingFlushAt` stays set for the whole
 * flush and only `flushLeaseUntil` moves, so a crashed flush is reclaimable
 * once the lease expires — see design §4.
 */
async function flushDueConversation(
  conversation: DueConversation,
): Promise<void> {
  const claimedPendingFlushAt = conversation.pendingFlushAt;
  const now = new Date();

  const claim = await prisma.conversation.updateMany({
    where: {
      id: conversation.id,
      pendingFlushAt: claimedPendingFlushAt,
      OR: [{ flushLeaseUntil: null }, { flushLeaseUntil: { lte: now } }],
    },
    data: { flushLeaseUntil: new Date(now.getTime() + FLUSH_LEASE_MS) },
  });
  if (claim.count !== 1) return;

  let sent: DueConversation | null = null;
  let threw = false;
  try {
    sent = await doFlush(conversation.id);
  } catch (err) {
    threw = true;
    throw err;
  } finally {
    if (threw) {
      // Leave pendingFlushAt set so a later sweep retries; only release the
      // lease. resolveAiReply/sendAndPersistReply already swallow their own
      // errors, so reaching here means a genuine DB fault mid-flush.
      await prisma.conversation.updateMany({
        where: { id: conversation.id },
        data: { flushLeaseUntil: null },
      });
    } else {
      // Compare-and-set: only clear pendingFlushAt if it's still the value
      // claimed above — a newer message may have bumped it mid-flush, in
      // which case that new window must survive, and only the lease clears.
      const released = await prisma.conversation.updateMany({
        where: { id: conversation.id, pendingFlushAt: claimedPendingFlushAt },
        data: { pendingFlushAt: null, flushLeaseUntil: null },
      });
      if (released.count === 0) {
        await prisma.conversation.updateMany({
          where: { id: conversation.id },
          data: { flushLeaseUntil: null },
        });
      }
    }
  }

  // Outside the lease, and after the reply is out. Both matter.
  //
  // FLUSH_LEASE_MS is 60s on the stated basis that a flush is history load + one
  // AI call + send. Summarizing inside the lease would quietly make that false by
  // adding a second AI call, and a slow provider could then let the lease expire
  // while this flush is still genuinely running — which is exactly the concurrent
  // double-flush the lease exists to prevent. Doing it after the release keeps the
  // 60s justification honest.
  //
  // Awaited rather than fire-and-forget: the customer already has their reply, so
  // there is no latency to save, and on a platform that can stop an instance once
  // the request returns, awaiting is what guarantees the work happens at all.
  if (sent) {
    try {
      await updateRollingSummary(sent.business, sent);
    } catch (err) {
      await logEvent(
        "error",
        "ai-summary",
        "Rolling summary update failed after a successful reply",
        { error: err instanceof Error ? err.message : String(err) },
        sent.business.id,
      );
    }
  }
}

/**
 * Runs the actual flush once the lease is held: re-fetches fresh state,
 * batches every not-yet-dispatched customer message, and resolves + sends
 * (or skips) the one reply. Every terminal branch below returns normally —
 * only a genuinely unexpected failure should throw out of here, since a
 * throw leaves `pendingFlushAt` set for a retry (see flushDueConversation).
 */
async function doFlush(
  conversationId: string,
): Promise<DueConversation | null> {
  // Re-read fresh rather than trusting the row the sweep originally
  // queried — status may have changed to "handed_off" or the
  // business/number may have been deactivated in the time between the
  // message arriving and the window elapsing.
  const fresh = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { business: true, phoneNumber: true },
  });
  if (!fresh) return null;
  if (fresh.status === "handed_off") return null;
  if (!fresh.business.isActive || !fresh.phoneNumber.isActive) return null;

  const { business, phoneNumber } = fresh;

  // Every not-yet-batched customer message — this is the batch, regardless
  // of how many separate windows it spanned (each new message resets
  // pendingFlushAt, so by the time we get here everything pending belongs to
  // one settled window). `batchedAt` is set inside `sendAndPersistReply`'s
  // persistence transaction, which commits BEFORE the actual WhatsApp send
  // (message-handler.ts:279-... — see its docstring). That means a crash
  // between that commit and the send resolving does NOT leave these
  // messages "exactly as pending as they were" — they're already
  // `batchedAt`-stamped, so this query (and therefore a later reclaim by
  // this function) will never see them again. The stranded assistant row
  // (`status: "pending"`, `wamid: null`) is instead recovered by the
  // separate `reapStrandedSends` reaper (message-handler.ts), wired into
  // the unscoped drain path — see outbox/drain.ts.
  const pendingMessages = await prisma.message.findMany({
    where: {
      conversationId: fresh.id,
      sentBy: "customer",
      batchedAt: null,
    },
    orderBy: { createdAt: "asc" },
  });
  if (pendingMessages.length === 0) return null;

  const batchedIds = pendingMessages.map((m) => m.id);
  const dispatchId = computeDispatchId(fresh.id, batchedIds);

  if (pendingMessages.every((m) => m.mediaType === "document")) {
    await sendAndPersistReply(
      business,
      phoneNumber,
      fresh.id,
      fresh.customerPhone,
      DOCUMENT_FALLBACK_REPLY,
      dispatchId,
      batchedIds,
    );
    return null;
  }

  // Same per-conversation abuse throttle as the (now-removed) immediate-reply
  // path — without this, batching would let a flood of messages defeat the
  // rate limit by riding in on one AI call. Messages stay persisted (and now
  // marked batched) either way; only the AI call/reply is skipped.
  if (await isRateLimited(fresh.id, business.id)) {
    await markBatched(batchedIds);
    return null;
  }

  // BATCH_INSTRUCTION is our own framing and stays outside the fence; every
  // message body is customer-authored and goes inside it. Each `message` is
  // sanitized before `JSON.stringify` rather than after, because sanitizing the
  // serialized output would leave deceptive invisibles inside the JSON string
  // values — see sanitizeUntrusted's doc comment.
  const quotes = await resolveQuotedMessages(fresh.id, pendingMessages);

  const batchedContent =
    BATCH_INSTRUCTION +
    renderUntrustedBlock(
      "MENSAJES DEL CLIENTE",
      JSON.stringify(
        pendingMessages.map((m, i) => ({
          message: sanitizeUntrusted(m.content),
          n: i + 1,
          time: m.createdAt.toISOString(),
          // Attributed inline rather than as a separate list, so the model cannot
          // mismatch a quote to the wrong message in the batch.
          ...(m.quotedWamid ? { quoted: quotes.get(m.quotedWamid) } : {}),
        })),
      ),
    );

  const history = await loadHistoryFor(
    fresh,
    business.maxHistoryMessages,
    pendingMessages[0].createdAt,
  );

  const reply = await resolveAiReply(
    business,
    fresh.id,
    history,
    batchedContent,
  );
  if (reply === null) {
    await markBatched(batchedIds);
    return null;
  }

  await sendAndPersistReply(
    business,
    phoneNumber,
    fresh.id,
    fresh.customerPhone,
    reply,
    dispatchId,
    batchedIds,
  );

  // Summarization deliberately does NOT happen here. It runs in
  // flushDueConversation once the lease is released — see the note there.
  return fresh;
}

/**
 * Marks a batch consumed without sending a reply — used by the rate-limit
 * and null-reply skip paths, which have no assistant Message row to fold
 * this into (see sendAndPersistReply's transaction for the send path).
 */
async function markBatched(messageIds: string[]): Promise<void> {
  await prisma.message.updateMany({
    where: { id: { in: messageIds } },
    data: { batchedAt: new Date() },
  });
}

/**
 * Longest quoted excerpt handed to the model.
 *
 * A quote is context for the reply, not the subject of it, so it does not need to
 * be complete — and an uncapped one would let a single long message be replayed in
 * full alongside every reply that references it.
 */
const MAX_QUOTED_TEXT_CHARS = 300;

type QuotedRef =
  | { available: true; author: "cliente" | "negocio"; text: string }
  | { available: false };

/**
 * Resolves what each batched message was replying to.
 *
 * One query for the whole batch rather than one per message, and — the part that
 * matters — **filtered by conversationId**. `Message.wamid` is unique GLOBALLY, so
 * a lookup by wamid alone would happily return a row belonging to a different
 * business, and a customer who guessed or observed another tenant's wamid could
 * have its text rendered into this business's prompt. The conversation filter is
 * the tenant boundary here, not a defensive nicety.
 *
 * An unresolvable quote — one that predates the `quotedWamid` column, points at a
 * deleted message, or belongs to someone else — comes back `available: false`. The
 * model is told the quote exists and could not be read, which is the honest
 * answer; inferring a referent from position or recency would invent a
 * conversation that never happened.
 */
async function resolveQuotedMessages(
  conversationId: string,
  pending: Array<{ quotedWamid: string | null }>,
): Promise<Map<string, QuotedRef>> {
  const wanted = [
    ...new Set(
      pending
        .map((m) => m.quotedWamid)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const resolved = new Map<string, QuotedRef>();
  if (wanted.length === 0) return resolved;

  const rows = await prisma.message.findMany({
    where: { conversationId, wamid: { in: wanted } },
    select: { wamid: true, content: true, sentBy: true },
  });

  for (const row of rows) {
    if (!row.wamid) continue;
    resolved.set(row.wamid, {
      available: true,
      author: row.sentBy === "customer" ? "cliente" : "negocio",
      // Quoted text is customer- or bot-authored and travels into the prompt, so
      // it gets the same treatment as a batched message body: sanitized, then
      // capped through the shared surrogate-safe truncation.
      text: truncateChars(
        sanitizeUntrusted(row.content),
        MAX_QUOTED_TEXT_CHARS,
      ),
    });
  }

  // Everything still missing is explicitly unavailable rather than absent, so the
  // rendered payload always says whether a quote could be read.
  for (const id of wanted) {
    if (!resolved.has(id)) resolved.set(id, { available: false });
  }

  return resolved;
}

/**
 * Loads the history for one flush: the rolling summary, when there is one, plus
 * the raw messages that came after it.
 *
 * Without a usable summary this is exactly the previous behaviour — the last
 * `max` raw messages — which is also the fallback whenever `summaryEnabled` is
 * off, the stored value fails re-validation, or no summary has been generated
 * yet. Degrading to raw history is always correct, just more forgetful, so every
 * failure path lands here rather than replying with less context.
 *
 * The `take: max` cap stays on the tail even with a summary present. The summary
 * exists to remember facts older than the window, not to widen it.
 */
async function loadHistoryFor(
  conversation: DueConversation,
  max: number,
  before: Date,
): Promise<ChatCompletionMessageParam[]> {
  const summary = conversation.business.summaryEnabled
    ? readConversationSummary(conversation)
    : null;
  const since = summary ? conversation.summarizedThroughAt : null;

  const rows = await prisma.message.findMany({
    where: {
      conversationId: conversation.id,
      createdAt: since ? { lt: before, gt: since } : { lt: before },
    },
    orderBy: { createdAt: "desc" },
    take: max,
  });

  const history: ChatCompletionMessageParam[] = rows.reverse().map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  if (!summary) return history;

  // The summary is model-generated text derived from customer messages, so it is
  // untrusted no matter how structured it is: it goes in the user role, inside
  // the fence, exactly like a batched message. This is the vector the trust
  // boundary was built for — a summary is replayed on every later flush, so an
  // instruction that survived into it would otherwise get a fresh chance to be
  // obeyed every single time.
  history.unshift({
    role: "user",
    content: renderUntrustedBlock(
      "RESUMEN DE LA CONVERSACIÓN",
      renderConversationSummary(summary),
    ),
  });
  return history;
}

/**
 * Regenerates the rolling summary, if enough new messages have accumulated.
 *
 * Called after the reply has been sent, on purpose. The customer is not waiting
 * on this, and the flush lease no longer matters here either: `sendAndPersistReply`
 * has already claimed its `dispatchId`, so even if the lease expires mid-summary
 * the unique constraint makes a second send impossible. That is what lets this be
 * a plain `await` — the work is guaranteed to run rather than racing a container
 * shutdown, and it still cannot delay or double a reply.
 *
 * Every failure is swallowed after logging. A conversation that misses a summary
 * simply keeps using raw history, which is the same state it was in before.
 */
async function updateRollingSummary(
  business: Business,
  conversation: DueConversation,
): Promise<void> {
  if (!business.summaryEnabled) return;

  const since = conversation.summarizedThroughAt;
  // Oldest-first from the watermark, capped.
  //
  // Taking the NEWEST N instead would leave a hole, and this is the subtle part.
  // Summarization runs after this flush's batch and its reply are persisted, so a
  // newest-N window sits further forward in the table than the tail the reply was
  // actually built from. The messages in between would then be in neither place:
  // absent from this summary, and — once the watermark advances past them —
  // excluded from every future raw tail as well. Silently unrecoverable.
  //
  // Oldest-first cannot leave a hole, because the watermark only ever advances
  // over messages this transcript actually contained. A backlog is summarized
  // incrementally across flushes rather than skipped once, which is slower to
  // catch up and never loses anything.
  const rows = await prisma.message.findMany({
    where: {
      conversationId: conversation.id,
      ...(since ? { createdAt: { gt: since } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: MAX_SUMMARY_TRANSCRIPT_MESSAGES,
  });

  // Clamped, because summaryEveryNMessages is an unconstrained Int: at 0 or
  // negative the comparison below would never be true, so every single flush
  // would pay for a summarization call — the exact opposite of a cadence.
  const everyN = Math.max(1, business.summaryEveryNMessages);
  if (rows.length === 0 || rows.length < everyN) return;

  const transcript = rows
    .map(
      (m) =>
        `${m.sentBy === "customer" ? "cliente" : "bot"}: ${sanitizeUntrusted(m.content)}`,
    )
    .join("\n");
  // The newest message THIS transcript covered — not the newest in the table.
  // That distinction is the whole no-hole guarantee.
  const newestAt = rows[rows.length - 1].createdAt;

  const { chatModel } = await resolveModels(business);
  const summary = await callWithAiCredential(business, (client) =>
    summarizeConversation(
      client,
      chatModel,
      transcript,
      readConversationSummary(conversation),
    ),
  );

  if (!summary) {
    await logEvent(
      "warn",
      "ai-summary",
      "Summarization produced nothing usable, keeping raw history",
      { conversationId: conversation.id, messages: rows.length },
      business.id,
    );
    return;
  }

  // Monotonic compare-and-set. Two flushes can overlap, and the loser must not
  // drag the watermark backwards — that would re-summarize messages already
  // covered and, worse, make the tail query hide messages the older summary does
  // not describe.
  const moved = await prisma.conversation.updateMany({
    where: {
      id: conversation.id,
      OR: [
        { summarizedThroughAt: null },
        { summarizedThroughAt: { lt: newestAt } },
      ],
    },
    data: { summary, summarizedThroughAt: newestAt },
  });

  if (moved.count === 0) {
    await logEvent(
      "info",
      "ai-summary",
      "Discarded a stale summary: another flush had already advanced past it",
      { conversationId: conversation.id, newestAt },
      business.id,
    );
  }
}
