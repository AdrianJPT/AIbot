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

/**
 * How long a conversation's dispatch claim (`flushLeaseUntil`) stays held
 * before it's eligible for reclaim by a later sweep tick — see
 * flushDueConversation's claim step. Strictly smaller worst case than the
 * outbox's 90s lease (repository.ts): parsing already happened at ingest, so
 * a flush is only history load + AI call + send. 2x headroom over the
 * credential-chain failover worst case (~30s, see design §2).
 */
const FLUSH_LEASE_MS = 60_000;

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

  let threw = false;
  try {
    await doFlush(conversation.id);
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
}

/**
 * Runs the actual flush once the lease is held: re-fetches fresh state,
 * batches every not-yet-dispatched customer message, and resolves + sends
 * (or skips) the one reply. Every terminal branch below returns normally —
 * only a genuinely unexpected failure should throw out of here, since a
 * throw leaves `pendingFlushAt` set for a retry (see flushDueConversation).
 */
async function doFlush(conversationId: string): Promise<void> {
  // Re-read fresh rather than trusting the row the sweep originally
  // queried — status may have changed to "handed_off" or the
  // business/number may have been deactivated in the time between the
  // message arriving and the window elapsing.
  const fresh = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { business: true, phoneNumber: true },
  });
  if (!fresh) return;
  if (fresh.status === "handed_off") return;
  if (!fresh.business.isActive || !fresh.phoneNumber.isActive) return;

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
  if (pendingMessages.length === 0) return;

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
    return;
  }

  // Same per-conversation abuse throttle as the (now-removed) immediate-reply
  // path — without this, batching would let a flood of messages defeat the
  // rate limit by riding in on one AI call. Messages stay persisted (and now
  // marked batched) either way; only the AI call/reply is skipped.
  if (await isRateLimited(fresh.id, business.id)) {
    await markBatched(batchedIds);
    return;
  }

  const batchedContent =
    BATCH_INSTRUCTION +
    JSON.stringify(
      pendingMessages.map((m, i) => ({
        message: m.content,
        n: i + 1,
        time: m.createdAt.toISOString(),
      })),
    );

  const history = await loadHistoryBefore(
    fresh.id,
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
    return;
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

async function loadHistoryBefore(
  conversationId: string,
  max: number,
  before: Date,
): Promise<ChatCompletionMessageParam[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId, createdAt: { lt: before } },
    orderBy: { createdAt: "desc" },
    take: max,
  });
  return rows.reverse().map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
}
