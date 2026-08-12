import type { Business, Conversation, PhoneNumber } from "@prisma/client";
import { PaymentSessionStatus } from "@prisma/client";
import { prisma } from "../db";
import { logEvent } from "../log";
import { resolveExpiresAt } from "./state-machine";
import { enqueue, type PaymentAnalysisPayload } from "./analysis-repository";
import { runAnalysisDrain } from "./analysis-job";

/**
 * Ingest hook (decision 6, tasks #568 PR2 phase 3): called from
 * message-handler.ts's `handleOneMessage`, after the customer's Message row
 * has been persisted, for image/document media only. Flag-gated per
 * decision 9 — `business.paymentsEnabled === false` is an early-return
 * no-op, leaving every payment table inert and existing ingest behavior
 * unchanged.
 *
 * Statuses a new proof can attach to. Deliberately narrower than
 * state-machine.ts's `OPEN_STATUSES` (which also includes
 * `ready_to_confirm`, for expiry purposes): a session already waiting on
 * the owner should not be perturbed by an unrelated new image — that
 * starts a fresh session instead, per the spec's "no open session" scenario.
 */
const ATTACHABLE_STATUSES: readonly PaymentSessionStatus[] = [
  PaymentSessionStatus.awaiting_proof,
  PaymentSessionStatus.analyzing,
  PaymentSessionStatus.customer_action,
];

/**
 * Inline analysis budget for the ingest path — mirrors the webhook route's
 * own inline `runDrain({ eventId, budgetMs })` pattern (src/app/api/webhook/
 * route.ts), so a proof sent to a `paymentsEnabled` business is analyzed
 * within the same request whenever possible. A crash or timeout here still
 * leaves the row `pending`/`processing` for the scheduled internal drain
 * (see src/app/api/internal/drain/route.ts) to recover — this is a latency
 * optimization, not the durability guarantee.
 */
const INLINE_ANALYSIS_BUDGET_MS = 12_000;

/**
 * Finds the customer's currently open `PaymentSession` for this
 * conversation, or creates a new one — the spec's "with an open session" /
 * "without an open session" scenarios. Attaches proofs one session at a
 * time per conversation: a business processes one purchase at a time in v1.
 */
async function findOrCreatePaymentSession(
  business: Business,
  conversation: Conversation,
) {
  const openSession = await prisma.paymentSession.findFirst({
    where: {
      businessId: business.id,
      conversationId: conversation.id,
      status: { in: [...ATTACHABLE_STATUSES] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (openSession) return openSession;

  return prisma.paymentSession.create({
    data: {
      businessId: business.id,
      conversationId: conversation.id,
      customerPhone: conversation.customerPhone,
      expiresAt: resolveExpiresAt(new Date()),
    },
  });
}

/**
 * Attaches an inbound image/document to a `PaymentSession` and enqueues its
 * analysis. No-op when `business.paymentsEnabled` is false — the only gate,
 * checked first and before any read/write, per decision 9's rollback story
 * (flip the flag, nothing else to undo).
 */
export async function maybeEnqueuePaymentAnalysis(
  business: Business,
  phoneNumber: PhoneNumber,
  conversation: Conversation,
  messageId: string,
  waMediaId: string,
  mediaType: "image" | "document",
): Promise<void> {
  if (!business.paymentsEnabled) return;

  const session = await findOrCreatePaymentSession(business, conversation);

  const payload: PaymentAnalysisPayload = {
    sessionId: session.id,
    messageId,
    waMediaId,
    businessId: business.id,
    phoneNumberId: phoneNumber.id,
    mediaType,
  };

  const event = await enqueue(payload);

  // Best-effort inline processing, same shape as the webhook route's own
  // inline drain — never lets an analysis failure surface as an ingest
  // failure. The row survives in the outbox regardless (enqueue() already
  // committed) for the scheduled drain to retry.
  try {
    await runAnalysisDrain({
      eventId: event.id,
      budgetMs: INLINE_ANALYSIS_BUDGET_MS,
    });
  } catch (err) {
    await logEvent(
      "error",
      "ai",
      "inline payment analysis drain failed",
      { error: err instanceof Error ? err.message : String(err), eventId: event.id },
      business.id,
      phoneNumber.id,
    );
  }
}
