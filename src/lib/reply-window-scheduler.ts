import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Business, Conversation, PhoneNumber } from "@prisma/client";
import { prisma } from "./db";
import { isRateLimited, resolveAiReply, sendAndPersistReply } from "./message-handler";
import { logEvent } from "./log";

/**
 * How often the sweep looks for conversations whose reply-window
 * (Business.replyWindowMs) has elapsed. Coarser than the window itself is
 * ever expected to be (seconds, not ms) — this just bounds the extra
 * latency added on top of the configured window.
 */
const SWEEP_INTERVAL_MS = 3000;

/**
 * Framing string prepended to the batched JSON payload so the model treats
 * the array as consecutive messages from one customer to answer together,
 * not as unrelated turns. Not shown to the customer — it's content framing
 * for the AI only, same content-role slot as a normal user message.
 */
const BATCH_INSTRUCTION =
  "El cliente envió varios mensajes seguidos, en este orden (ver \"n\"). " +
  "Respondelos todos juntos, en una sola respuesta:\n";

let started = false;

/**
 * Starts the reply-window sweep loop. Must run exactly once per process —
 * guarded by the module-level `started` flag — and only hooked in from
 * src/instrumentation.ts under the Node.js runtime (not edge), since it
 * uses setInterval and the Prisma client.
 *
 * Why polling instead of a per-conversation in-memory timer: Railway
 * restarts the Node process on every deploy, which would silently drop any
 * in-flight timer and its pending batch. This project's existing
 * per-conversation rate limiter already commits to "never silently drop
 * messages" (see message-handler.ts's RATE_LIMIT_WINDOW_MS comment) —
 * persisting the due-time on Conversation.pendingFlushAt and sweeping for it
 * keeps that guarantee across restarts.
 */
export function startReplyWindowScheduler(): void {
  if (started) return;
  started = true;

  setInterval(() => {
    sweepDueConversations().catch((err) => {
      logEvent("error", "ai", "Reply-window sweep failed", {
        error: err instanceof Error ? err.message : String(err),
      }).catch(() => undefined);
    });
  }, SWEEP_INTERVAL_MS);
}

type DueConversation = Conversation & {
  business: Business;
  phoneNumber: PhoneNumber;
};

async function sweepDueConversations(): Promise<void> {
  const due = await prisma.conversation.findMany({
    where: { pendingFlushAt: { lte: new Date() } },
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
        conversation.businessId
      );
    }
  }
}

/**
 * Flushes a single due conversation: atomically claims it (so a slow flush
 * that overruns the next sweep tick, or two overlapping process instances,
 * can't double-send), batches every not-yet-answered customer message into
 * one AI call, and sends the single reply back.
 */
async function flushDueConversation(conversation: DueConversation): Promise<void> {
  // Atomic claim: only proceed if this sweep is the one that flips
  // pendingFlushAt from the value we just read to null. If another tick (or
  // process) already claimed it, count is 0 and we skip — avoids double
  // processing without needing a separate lock table.
  const claim = await prisma.conversation.updateMany({
    where: { id: conversation.id, pendingFlushAt: conversation.pendingFlushAt },
    data: { pendingFlushAt: null },
  });
  if (claim.count !== 1) return;

  // Re-read the conversation (plus business/phoneNumber) fresh rather than
  // trusting the row the sweep originally queried — status may have changed
  // to "handed_off" (a human agent took over) or the business/number may
  // have been deactivated in the time between the message arriving and the
  // window elapsing. Extends the claim step's DB round-trip rather than
  // adding a second one.
  const fresh = await prisma.conversation.findUnique({
    where: { id: conversation.id },
    include: { business: true, phoneNumber: true },
  });
  if (!fresh) return;
  if (fresh.status === "handed_off") return;
  if (!fresh.business.isActive || !fresh.phoneNumber.isActive) return;

  const { business, phoneNumber } = fresh;

  // Every not-yet-batched customer message — this is the batch, regardless
  // of how many separate windows it spanned (each new message resets
  // pendingFlushAt, so by the time we get here everything pending belongs to
  // one settled window). Uses an explicit per-message marker (batchedAt)
  // rather than comparing against the last bot message's createdAt: an
  // overlapping/slow flush's bot reply can be persisted with a timestamp
  // after a newer customer message, which would otherwise wrongly exclude
  // that message from its own batch.
  const pendingMessages = await prisma.message.findMany({
    where: { conversationId: conversation.id, sentBy: "customer", batchedAt: null },
    orderBy: { createdAt: "asc" },
  });

  if (pendingMessages.length === 0) return;

  // Mark these messages consumed before calling the AI — not after — so a
  // message can never be double-counted across overlapping flushes.
  await prisma.message.updateMany({
    where: { id: { in: pendingMessages.map((m) => m.id) } },
    data: { batchedAt: new Date() },
  });

  // Same per-conversation abuse throttle as the immediate-reply path (see
  // message-handler.ts's isRateLimited) — without this, batching would let a
  // flood of messages defeat the rate limit by riding in on one AI call.
  // Messages stay persisted (and now marked batched) either way; only the AI
  // call/reply is skipped, matching the immediate path's semantics.
  if (await isRateLimited(conversation.id, business.id)) return;

  const batchedContent =
    BATCH_INSTRUCTION +
    JSON.stringify(
      pendingMessages.map((m, i) => ({
        message: m.content,
        n: i + 1,
        time: m.createdAt.toISOString(),
      }))
    );

  // History excludes the pending batch itself (it's passed separately, as
  // batchedContent) — mirrors the immediate-reply path in message-handler.ts,
  // which loads history before persisting the triggering message.
  const history = await loadHistoryBefore(
    conversation.id,
    business.maxHistoryMessages,
    pendingMessages[0].createdAt
  );

  const reply = await resolveAiReply(business, conversation.id, history, batchedContent);
  if (reply === null) return;

  await sendAndPersistReply(
    business,
    phoneNumber,
    conversation.id,
    conversation.customerPhone,
    reply
  );
}

async function loadHistoryBefore(
  conversationId: string,
  max: number,
  before: Date
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
