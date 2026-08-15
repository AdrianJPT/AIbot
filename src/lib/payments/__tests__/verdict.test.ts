import { describe, expect, it } from "vitest";
import {
  LOW_CONFIDENCE_THRESHOLD,
  TAMPERING_THRESHOLD,
  computeVerdict,
  remainingAmount,
  type EvidenceAnalysis,
  type PaymentCatalogContext,
  type PaymentDedupLookup,
  type PaymentSessionContext,
} from "../verdict";

const CATALOG: PaymentCatalogContext = {
  expectedAmount: 22_000, // $220.00 in cents
  currency: "MXN",
};

const SESSION: PaymentSessionContext = {
  customerName: "Sofía Ramírez",
  businessAccountIdentifiers: ["CLABE-0001-1234"],
};

const NO_MATCHES: PaymentDedupLookup = {
  hasReference: () => false,
  hasImageHash: () => false,
};

function baseEvidence(overrides: Partial<EvidenceAnalysis> = {}): EvidenceAnalysis {
  return {
    amount: 22_000,
    currency: "MXN",
    paidAt: "2026-08-01T10:00:00.000Z",
    reference: "REF-100",
    destinationAccount: "CLABE-0001-1234",
    payerName: "Sofía Ramírez",
    transferStatus: "completed",
    tamperingScore: 0,
    imageHash: "hash-abc",
    confidence: 0.95,
    ...overrides,
  };
}

describe("computeVerdict — valid payment", () => {
  it("returns valid when amount, destination, status, reference and confidence all check out", () => {
    const result = computeVerdict(
      baseEvidence(),
      CATALOG,
      SESSION,
      NO_MATCHES,
    );
    expect(result).toEqual({ verdict: "valid", reason: null, confidence: 0.95 });
  });
});

describe("computeVerdict — amount mismatches", () => {
  it("flags a partial payment with the remaining amount implied by catalog - received", () => {
    const result = computeVerdict(
      baseEvidence({ amount: 10_000 }),
      CATALOG,
      SESSION,
      NO_MATCHES,
    );
    expect(result.verdict).toBe("needs_attention");
    expect(result.reason).toBe("partial");
  });

  it("flags an overpayment when the amount exceeds the catalog price", () => {
    const result = computeVerdict(
      baseEvidence({ amount: 30_000 }),
      CATALOG,
      SESSION,
      NO_MATCHES,
    );
    expect(result.verdict).toBe("needs_attention");
    expect(result.reason).toBe("overpaid");
  });
});

describe("computeVerdict — security signals", () => {
  it("flags a destination account that does not match the business account as suspicious", () => {
    const result = computeVerdict(
      baseEvidence({ destinationAccount: "SOMEONE-ELSES-ACCOUNT" }),
      CATALOG,
      SESSION,
      NO_MATCHES,
    );
    expect(result.verdict).toBe("suspicious");
    expect(result.reason).toBe("wrong_destination");
  });

  it("flags tampering signals above threshold as suspicious", () => {
    const result = computeVerdict(
      baseEvidence({ tamperingScore: TAMPERING_THRESHOLD + 0.1 }),
      CATALOG,
      SESSION,
      NO_MATCHES,
    );
    expect(result.verdict).toBe("suspicious");
    expect(result.reason).toBe("tampering");
  });

  it("does not flag tampering when the score sits at or below the threshold", () => {
    const result = computeVerdict(
      baseEvidence({ tamperingScore: TAMPERING_THRESHOLD }),
      CATALOG,
      SESSION,
      NO_MATCHES,
    );
    expect(result.verdict).not.toBe("suspicious");
  });
});

describe("computeVerdict — duplicates never count amount twice", () => {
  it("flags a duplicate reference already seen for the business", () => {
    const result = computeVerdict(
      baseEvidence({ reference: "REF-100" }),
      CATALOG,
      SESSION,
      { hasReference: (ref) => ref === "REF-100", hasImageHash: () => false },
    );
    expect(result.verdict).toBe("duplicate");
    expect(result.reason).toBe("duplicate_reference");
  });

  it("flags a duplicate image hash from an identical re-send", () => {
    const result = computeVerdict(
      baseEvidence({ imageHash: "hash-abc" }),
      CATALOG,
      SESSION,
      { hasReference: () => false, hasImageHash: (h) => h === "hash-abc" },
    );
    expect(result.verdict).toBe("duplicate");
    expect(result.reason).toBe("duplicate_image");
  });
});

describe("computeVerdict — in-flight transfers", () => {
  it("flags a pending transfer status as needs_attention/in_flight", () => {
    const result = computeVerdict(
      baseEvidence({ transferStatus: "pending" }),
      CATALOG,
      SESSION,
      NO_MATCHES,
    );
    expect(result.verdict).toBe("needs_attention");
    expect(result.reason).toBe("in_flight");
  });

  it("flags a scheduled transfer status as needs_attention/in_flight", () => {
    const result = computeVerdict(
      baseEvidence({ transferStatus: "scheduled" }),
      CATALOG,
      SESSION,
      NO_MATCHES,
    );
    expect(result.verdict).toBe("needs_attention");
    expect(result.reason).toBe("in_flight");
  });
});

describe("computeVerdict — third-party payer", () => {
  it("flags a mismatched payer name as needs_attention, never invalid or suspicious", () => {
    const result = computeVerdict(
      baseEvidence({ payerName: "Otro Nombre" }),
      CATALOG,
      SESSION,
      NO_MATCHES,
    );
    expect(result.verdict).toBe("needs_attention");
    expect(result.reason).toBe("third_party");
  });
});

describe("computeVerdict — low confidence overrides everything else", () => {
  it("escalates on low confidence even when the destination is also wrong", () => {
    const result = computeVerdict(
      baseEvidence({
        confidence: LOW_CONFIDENCE_THRESHOLD - 0.01,
        destinationAccount: "SOMEONE-ELSES-ACCOUNT",
      }),
      CATALOG,
      SESSION,
      NO_MATCHES,
    );
    expect(result.verdict).toBe("needs_attention");
    expect(result.reason).toBe("low_confidence");
  });

  it("does not trigger low_confidence right at the threshold", () => {
    const result = computeVerdict(
      baseEvidence({ confidence: LOW_CONFIDENCE_THRESHOLD }),
      CATALOG,
      SESSION,
      NO_MATCHES,
    );
    expect(result.reason).not.toBe("low_confidence");
  });
});

describe("computeVerdict — invalid fallback", () => {
  it("returns invalid when no amount could be extracted at all", () => {
    const result = computeVerdict(
      baseEvidence({ amount: null }),
      CATALOG,
      SESSION,
      NO_MATCHES,
    );
    expect(result.verdict).toBe("invalid");
    expect(result.reason).toBe("missing_amount");
  });
});

describe("remainingAmount — hold-until-complete partial payments", () => {
  it("computes what is still owed after a partial payment", () => {
    expect(remainingAmount(22_000, 10_000)).toBe(12_000);
  });

  it("never goes negative once the customer has overpaid", () => {
    expect(remainingAmount(22_000, 30_000)).toBe(0);
  });
});
