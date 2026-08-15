import type { PaymentVerdict } from "@prisma/client";

/**
 * Deterministic verdict engine — the other half of the deterministic core
 * from docs/payment-verification-engine.md decision 1 and 5. Pure function:
 * no AI calls, no I/O, no Prisma. Everything it needs — the validated
 * extraction, the catalog price, business/customer identity context and a
 * dedup lookup — is passed in by the caller, which is what makes every rule
 * below unit-testable without ever invoking a model.
 *
 * `evidence` is expected to already be validated (slice 2's
 * `validateEvidenceAnalysis`, mirroring `validateConversationSummary`'s
 * "never trust raw model JSON" contract) — this module trusts its shape.
 *
 * Rule precedence (first match wins, top to bottom):
 *   1. low confidence            -> needs_attention/low_confidence  (checked
 *      first: "regardless of other signals", per spec)
 *   2. missing amount            -> invalid/missing_amount
 *   3. duplicate reference/image -> duplicate/duplicate_reference|duplicate_image
 *   4. wrong destination account -> suspicious/wrong_destination
 *   5. tampering signals         -> suspicious/tampering
 *   6. transfer still in flight  -> needs_attention/in_flight
 *   7. amount < expected         -> needs_attention/partial
 *   8. amount > expected         -> needs_attention/overpaid
 *   9. payer identity mismatch   -> needs_attention/third_party (never
 *      auto-rejected, per spec)
 *  10. everything checks out     -> valid
 */

/** v1 thresholds — per decision 5, per-business overrides land later. */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;
export const TAMPERING_THRESHOLD = 0.5;

export type TransferStatus = "completed" | "pending" | "scheduled" | "unknown";

/**
 * The validated shape produced by slice 2's extraction step. Amounts are
 * minor units (cents), matching CatalogItem.price / PaymentSession fields —
 * see schema.prisma decision 2.
 */
export type EvidenceAnalysis = {
  amount: number | null;
  currency: string | null;
  paidAt: string | null;
  reference: string | null;
  destinationAccount: string | null;
  payerName: string | null;
  transferStatus: TransferStatus | null;
  /** 0..1 — edit/montage signal strength reported by extraction. */
  tamperingScore: number | null;
  /** sha256 of the proof buffer, computed outside the model. */
  imageHash: string | null;
  /** 0..1 overall extraction confidence. */
  confidence: number;
};

export type PaymentCatalogContext = {
  expectedAmount: number | null;
  currency: string | null;
};

export type PaymentSessionContext = {
  /** Known customer identity (Conversation.nickname/customerName) for the third-party check. */
  customerName: string | null;
  /** Accepted destination account identifiers for the business. */
  businessAccountIdentifiers: string[];
};

export type PaymentDedupLookup = {
  hasReference: (reference: string) => boolean;
  hasImageHash: (imageHash: string) => boolean;
};

export type PaymentVerdictReason =
  | "low_confidence"
  | "missing_amount"
  | "duplicate_reference"
  | "duplicate_image"
  | "wrong_destination"
  | "tampering"
  | "in_flight"
  | "partial"
  | "overpaid"
  | "third_party";

export type VerdictResult = {
  verdict: PaymentVerdict;
  reason: PaymentVerdictReason | null;
  confidence: number;
};

function result(
  verdict: PaymentVerdict,
  reason: PaymentVerdictReason | null,
  confidence: number,
): VerdictResult {
  return { verdict, reason, confidence };
}

/** Case/whitespace-insensitive identity match — extraction/OCR text is noisy. */
function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function computeVerdict(
  evidence: EvidenceAnalysis,
  catalog: PaymentCatalogContext,
  session: PaymentSessionContext,
  dedup: PaymentDedupLookup,
): VerdictResult {
  if (evidence.confidence < LOW_CONFIDENCE_THRESHOLD) {
    return result("needs_attention", "low_confidence", evidence.confidence);
  }

  if (evidence.amount === null) {
    return result("invalid", "missing_amount", evidence.confidence);
  }

  if (evidence.reference && dedup.hasReference(evidence.reference)) {
    return result("duplicate", "duplicate_reference", evidence.confidence);
  }
  if (evidence.imageHash && dedup.hasImageHash(evidence.imageHash)) {
    return result("duplicate", "duplicate_image", evidence.confidence);
  }

  if (
    evidence.destinationAccount &&
    session.businessAccountIdentifiers.length > 0 &&
    !session.businessAccountIdentifiers.includes(evidence.destinationAccount)
  ) {
    return result("suspicious", "wrong_destination", evidence.confidence);
  }

  if (
    evidence.tamperingScore !== null &&
    evidence.tamperingScore > TAMPERING_THRESHOLD
  ) {
    return result("suspicious", "tampering", evidence.confidence);
  }

  if (
    evidence.transferStatus === "pending" ||
    evidence.transferStatus === "scheduled"
  ) {
    return result("needs_attention", "in_flight", evidence.confidence);
  }

  if (catalog.expectedAmount !== null) {
    if (evidence.amount < catalog.expectedAmount) {
      return result("needs_attention", "partial", evidence.confidence);
    }
    if (evidence.amount > catalog.expectedAmount) {
      return result("needs_attention", "overpaid", evidence.confidence);
    }
  }

  if (
    evidence.payerName &&
    session.customerName &&
    !namesMatch(evidence.payerName, session.customerName)
  ) {
    return result("needs_attention", "third_party", evidence.confidence);
  }

  return result("valid", null, evidence.confidence);
}

/** Remaining amount owed for a partial payment — expected minus received. */
export function remainingAmount(
  expectedAmount: number,
  receivedAmount: number,
): number {
  return Math.max(0, expectedAmount - receivedAmount);
}
