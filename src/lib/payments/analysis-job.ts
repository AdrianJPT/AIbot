import { createHash } from "node:crypto";
import { PaymentSessionStatus, Prisma, type PaymentVerdict } from "@prisma/client";
import { prisma } from "../db";
import { downloadMediaBuffer, extractPaymentEvidence } from "../media";
import { resolveWhatsappToken } from "../whatsapp";
import { sendAndPersistReply } from "../message-handler";
import { logEvent } from "../log";
import {
  applyTransition,
  type PaymentTransitionEvent,
  type TransitionAudit,
} from "./state-machine";
import {
  computeVerdict,
  type EvidenceAnalysis,
  type PaymentCatalogContext,
  type PaymentSessionContext,
  type PaymentVerdictReason,
} from "./verdict";
import {
  claimBatch,
  complete,
  expireStale,
  fail,
  type PaymentAnalysisPayload,
} from "./analysis-repository";

/**
 * The async half of the analysis pipeline (decision 6, tasks #568 PR2 phase
 * 2): download the proof, extract (media.ts's `extractPaymentEvidence`),
 * validate, run the deterministic verdict engine (verdict.ts, built in
 * slice 1), apply the state-machine transition (state-machine.ts, also
 * slice 1), and persist everything this slice's schema addition made
 * possible — `PaymentProof` and `PaymentAuditEntry` rows are written here
 * for the first time; slice 1 only returned descriptors.
 *
 * `PaymentProof.extracted/verdict/confidence` are non-nullable (schema.prisma,
 * slice 1), so the proof row can only be created once analysis has actually
 * run — the ingest hook (ingest.ts) only creates/attaches the
 * `PaymentSession` and enqueues this job; this module owns every
 * `PaymentProof` write.
 */

const CUSTOMER_ACTION_MESSAGES: Partial<Record<PaymentVerdictReason, string>> = {
  missing_amount:
    "No pudimos leer el comprobante que enviaste. ¿Podrías reenviarlo bien enfocado y completo?",
  wrong_destination:
    "El comprobante que enviaste no corresponde a nuestra cuenta. ¿Podrías revisar y enviarnos el comprobante correcto?",
  tampering:
    "No pudimos verificar ese comprobante. Un miembro de nuestro equipo lo va a revisar y te contactamos en breve.",
  duplicate_reference:
    "Ya habíamos registrado ese comprobante, no hace falta reenviarlo.",
  duplicate_image:
    "Ya habíamos registrado ese comprobante, no hace falta reenviarlo.",
};

const DEFAULT_CUSTOMER_ACTION_MESSAGE =
  "No pudimos verificar el comprobante que enviaste. ¿Podrías reenviarlo?";

const ESCALATION_MESSAGE =
  "Un miembro de nuestro equipo va a revisar tu pago y te va a contactar en breve. Gracias por tu paciencia.";

/** Verdicts that keep the session in the AI<->customer loop instead of
 * landing in the owner inbox — see docs/payment-verification-engine.md's
 * verdict taxonomy table (suspicious/invalid/audit queue; duplicate never
 * reaches the owner either, since nothing changed). */
function verdictNeedsCustomerAction(verdict: PaymentVerdict): boolean {
  return (
    verdict === "suspicious" || verdict === "invalid" || verdict === "duplicate"
  );
}

/** The event that moves a session from its current status into `analyzing`,
 * or `null` when it is already there (e.g. a defensive re-run). */
function entryEventFor(
  status: PaymentSessionStatus,
): PaymentTransitionEvent | null {
  if (status === PaymentSessionStatus.awaiting_proof) return "proof_received";
  if (status === PaymentSessionStatus.customer_action)
    return "customer_responded";
  return null;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const EMPTY_EVIDENCE: Omit<EvidenceAnalysis, "imageHash" | "confidence"> = {
  amount: null,
  currency: null,
  paidAt: null,
  reference: null,
  destinationAccount: null,
  payerName: null,
  transferStatus: null,
  tamperingScore: null,
};

/**
 * Processes exactly one `PaymentAnalysisEvent` payload end to end.
 * Idempotent by proof id: a `PaymentProof` already linked to this
 * `messageId` means a prior attempt already completed all of its DB writes
 * before crashing (or being retried after `fail`), so this returns
 * immediately rather than creating a duplicate proof or double-applying a
 * transition.
 */
export async function processPaymentAnalysisEvent(
  payload: PaymentAnalysisPayload,
): Promise<void> {
  const existingProof = await prisma.paymentProof.findFirst({
    where: { messageId: payload.messageId },
  });
  if (existingProof) return;

  const [business, phoneNumber, session] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: payload.businessId } }),
    prisma.phoneNumber.findUniqueOrThrow({ where: { id: payload.phoneNumberId } }),
    prisma.paymentSession.findUniqueOrThrow({
      where: { id: payload.sessionId },
      include: { catalogItem: true, conversation: true },
    }),
  ]);

  const token = await resolveWhatsappToken(phoneNumber, business.ownerId);
  const { buffer, mimeType } = await downloadMediaBuffer(payload.waMediaId, token);
  const imageHash = createHash("sha256").update(buffer).digest("hex");

  const extracted = await extractPaymentEvidence(business, buffer, mimeType);
  const evidence: EvidenceAnalysis = extracted
    ? { ...extracted, imageHash }
    : { ...EMPTY_EVIDENCE, imageHash, confidence: 0 };

  const [existingRefs, existingHashes] = await Promise.all([
    prisma.paymentProof.findMany({
      where: { session: { businessId: business.id }, reference: { not: null } },
      select: { reference: true },
    }),
    prisma.paymentProof.findMany({
      where: { session: { businessId: business.id }, imageHash: { not: null } },
      select: { imageHash: true },
    }),
  ]);
  const refSet = new Set(existingRefs.map((r) => r.reference as string));
  const hashSet = new Set(existingHashes.map((h) => h.imageHash as string));

  const catalog: PaymentCatalogContext = {
    expectedAmount: session.expectedAmount,
    currency: session.catalogItem?.currency ?? null,
  };
  // No per-business accepted-account config exists yet (schema gap, not
  // addressed in this slice) — an empty list is computeVerdict's documented
  // "no configured accounts, skip the wrong_destination check" case.
  const sessionContext: PaymentSessionContext = {
    customerName: session.conversation?.customerName ?? null,
    businessAccountIdentifiers: [],
  };

  const verdictResult = computeVerdict(evidence, catalog, sessionContext, {
    hasReference: (r) => refSet.has(r),
    hasImageHash: (h) => hashSet.has(h),
  });

  const proof = await prisma.paymentProof.create({
    data: {
      sessionId: session.id,
      messageId: payload.messageId,
      waMediaId: payload.waMediaId,
      // Persisted here — not just hashed and discarded — because Meta's CDN
      // media id expires ~30 days and the owner inbox (slice 3) needs to
      // preview the proof long after that. See PaymentProof.mediaData's
      // schema comment and docs/payment-verification-engine.md decision 8.
      mediaData: buffer,
      mediaMimeType: mimeType,
      extracted: evidence as unknown as Prisma.InputJsonValue,
      verdict: verdictResult.verdict,
      confidence: evidence.confidence,
      reference: evidence.reference,
      imageHash: evidence.imageHash,
      paidAt: evidence.paidAt ? new Date(evidence.paidAt) : null,
    },
  });

  await prisma.paymentAuditEntry.create({
    data: {
      sessionId: session.id,
      actor: "ai",
      action: "proof_received",
      detail: {
        proofId: proof.id,
        verdict: verdictResult.verdict,
        reason: verdictResult.reason,
        confidence: verdictResult.confidence,
      },
    },
  });

  let cursor = { status: session.status, autonomyRounds: session.autonomyRounds };
  const auditDescriptors: TransitionAudit[] = [];

  const entryEvent = entryEventFor(session.status);
  if (entryEvent) {
    const step = applyTransition(cursor, entryEvent);
    cursor = { status: step.status, autonomyRounds: step.autonomyRounds };
    auditDescriptors.push(step.audit);
  }

  let customerMessage: string | null = null;
  let statusReason: PaymentVerdictReason | "autonomy_exhausted" | null =
    verdictResult.reason;

  if (verdictNeedsCustomerAction(verdictResult.verdict)) {
    if (cursor.autonomyRounds <= 0) {
      const step = applyTransition(cursor, "autonomy_exhausted");
      cursor = { status: step.status, autonomyRounds: step.autonomyRounds };
      auditDescriptors.push(step.audit);
      customerMessage = ESCALATION_MESSAGE;
      statusReason = "autonomy_exhausted";
    } else {
      const step = applyTransition(cursor, "needs_customer_action");
      cursor = { status: step.status, autonomyRounds: step.autonomyRounds };
      auditDescriptors.push(step.audit);
      customerMessage =
        (verdictResult.reason &&
          CUSTOMER_ACTION_MESSAGES[verdictResult.reason]) ||
        DEFAULT_CUSTOMER_ACTION_MESSAGE;
    }
  } else {
    // valid or needs_attention — both land in ready_to_confirm, see
    // docs/payment-verification-engine.md's verdict taxonomy table.
    const step = applyTransition(cursor, "verdict_ready");
    cursor = { status: step.status, autonomyRounds: step.autonomyRounds };
    auditDescriptors.push(step.audit);
  }

  await prisma.paymentSession.update({
    where: { id: session.id },
    data: {
      status: cursor.status,
      autonomyRounds: cursor.autonomyRounds,
      statusReason,
    },
  });

  for (const audit of auditDescriptors) {
    await prisma.paymentAuditEntry.create({
      data: {
        sessionId: session.id,
        actor: "system",
        action: audit.action,
        detail: audit.detail as Prisma.InputJsonValue | undefined,
      },
    });
  }

  if (customerMessage) {
    const dispatchId = createHash("sha256")
      .update(`payment-analysis:${proof.id}`)
      .digest("hex");
    try {
      await sendAndPersistReply(
        business,
        phoneNumber,
        session.conversationId,
        session.customerPhone,
        customerMessage,
        dispatchId,
        [],
      );
      await prisma.paymentAuditEntry.create({
        data: {
          sessionId: session.id,
          actor: "ai",
          action: "message_sent",
          detail: { proofId: proof.id },
        },
      });
    } catch (err) {
      await logEvent(
        "error",
        "ai",
        "payment analysis customer notification failed",
        { error: describeError(err), sessionId: session.id, proofId: proof.id },
        business.id,
        phoneNumber.id,
      );
    }
  }
}

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_BUDGET_MS = 50_000;

/**
 * How long a claimed row stays leased before `expireStale` reclaims it —
 * same rationale as outbox/drain.ts's `LEASE_TTL_SECONDS`: must comfortably
 * exceed the slowest single-proof step (a vision extraction call).
 */
const LEASE_TTL_SECONDS = 90;

export interface AnalysisDrainResult {
  claimed: number;
  processed: number;
  failed: number;
  remaining: boolean;
}

export interface AnalysisDrainOptions {
  batchSize?: number;
  budgetMs?: number;
  /** Scopes the drain to a single row, mirroring outbox/drain.ts's inline
   * per-request usage from the ingest path. */
  eventId?: string;
}

/**
 * Recovers orphaned leases, then claims and processes pending
 * `PaymentAnalysisEvent` rows one batch at a time until the queue is empty
 * or the time budget runs out — same claim/lease/backoff shape as
 * outbox/drain.ts's `runDrain`, without the reply-window sweep integration
 * (payment notifications are sent directly by `processPaymentAnalysisEvent`
 * via `sendAndPersistReply`, not through the reply-window scheduler).
 */
export async function runAnalysisDrain(
  options: AnalysisDrainOptions = {},
): Promise<AnalysisDrainResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const { eventId } = options;
  const startedAt = Date.now();
  const workerId = `payment-analysis-${startedAt}-${Math.random().toString(36).slice(2)}`;

  const result: AnalysisDrainResult = {
    claimed: 0,
    processed: 0,
    failed: 0,
    remaining: false,
  };

  await expireStale();

  for (;;) {
    if (Date.now() - startedAt >= budgetMs) {
      result.remaining = true;
      break;
    }

    const batch = await claimBatch(batchSize, LEASE_TTL_SECONDS, workerId, eventId);
    if (batch.length === 0) break;
    result.claimed += batch.length;

    for (const event of batch) {
      if (Date.now() - startedAt >= budgetMs) {
        await fail(event.id, "drain budget exceeded before processing");
        result.remaining = true;
        continue;
      }

      try {
        await processPaymentAnalysisEvent(
          event.payload as unknown as PaymentAnalysisPayload,
        );
        await complete(event.id);
        result.processed += 1;
      } catch (err) {
        await fail(event.id, describeError(err));
        result.failed += 1;
      }
    }

    if (eventId || batch.length < batchSize) break;
  }

  return result;
}
