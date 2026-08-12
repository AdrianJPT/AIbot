import { createHash } from "node:crypto";
import type {
  PaymentAuditEntry,
  PaymentProof,
  PaymentSession,
} from "@prisma/client";
import { validateEvidenceAnalysis } from "../media";
import { remainingAmount } from "./verdict";

/**
 * Shared read-side serialization for the owner surfaces (routes + feature
 * module, tasks #568 PR3). Kept in one module so the inbox list, detail
 * route, and any future consumer never re-derive `remaining`/`extracted`
 * validation differently — `PaymentProof.extracted` is Json and MUST be
 * re-validated on every read (schema.prisma comment, same contract as
 * Conversation.summary).
 */

export type SerializedProof = {
  id: string;
  verdict: string;
  confidence: number;
  reference: string | null;
  paidAt: string | null;
  createdAt: string;
  hasMedia: boolean;
  extracted: ReturnType<typeof validateEvidenceAnalysis>;
};

export function serializeProof(proof: PaymentProof): SerializedProof {
  return {
    id: proof.id,
    verdict: proof.verdict,
    confidence: proof.confidence,
    reference: proof.reference,
    paidAt: proof.paidAt ? proof.paidAt.toISOString() : null,
    createdAt: proof.createdAt.toISOString(),
    hasMedia: proof.mediaData !== null,
    // Never trust the stored Json blindly — same "reader re-validates"
    // contract as validateConversationSummary.
    extracted: validateEvidenceAnalysis(proof.extracted),
  };
}

export function serializeAuditEntry(entry: PaymentAuditEntry) {
  return {
    id: entry.id,
    actor: entry.actor,
    action: entry.action,
    detail: entry.detail,
    createdAt: entry.createdAt.toISOString(),
  };
}

/**
 * The dispatchId `processPaymentAnalysisEvent` (analysis-job.ts) uses for a
 * proof's customer follow-up message — reused here read-side to look up
 * whether (and what) the AI actually told the customer about this proof.
 * Duplicated on purpose (single-purpose one-liner) rather than importing
 * from analysis-job.ts, which pulls in DB/AI-call side effects this
 * read-only module must not depend on.
 */
export function proofDispatchId(proofId: string): string {
  return createHash("sha256").update(`payment-analysis:${proofId}`).digest("hex");
}

export type SessionWithRelations = PaymentSession & {
  catalogItem: { name: string; price: number; currency: string } | null;
  conversation: { customerName: string | null; nickname: string | null };
  proofs: PaymentProof[];
};

export function serializeSessionSummary(
  session: SessionWithRelations,
  aiMessage: string | null,
) {
  const latestProof = session.proofs[0] ?? null;
  const serializedProof = latestProof ? serializeProof(latestProof) : null;
  // `PaymentSession.receivedAmount` is never written by the analysis job
  // (slice 2 gap, see apply-progress) — it stays 0 for every session, so it
  // is not a trustworthy "received" figure to show the owner. The latest
  // proof's own extracted amount is what the owner actually needs to see
  // for a partial/overpaid flag, so that is used here instead.
  const receivedFromProof = serializedProof?.extracted?.amount ?? null;
  return {
    id: session.id,
    conversationId: session.conversationId,
    customerPhone: session.customerPhone,
    customerName:
      session.conversation.nickname ?? session.conversation.customerName ?? null,
    status: session.status,
    statusReason: session.statusReason,
    expectedAmount: session.expectedAmount,
    receivedAmount: receivedFromProof,
    remaining:
      session.expectedAmount !== null && receivedFromProof !== null
        ? remainingAmount(session.expectedAmount, receivedFromProof)
        : null,
    catalogItem: session.catalogItem,
    latestProof: serializedProof,
    aiMessage,
    confirmedById: session.confirmedById,
    confirmedAt: session.confirmedAt ? session.confirmedAt.toISOString() : null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}
