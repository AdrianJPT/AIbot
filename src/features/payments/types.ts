export type PaymentEvidence = {
  amount: number | null;
  currency: string | null;
  paidAt: string | null;
  reference: string | null;
  destinationAccount: string | null;
  payerName: string | null;
  transferStatus: string | null;
  tamperingScore: number | null;
  imageHash: string | null;
  confidence: number;
} | null;

export type PaymentProofSummary = {
  id: string;
  verdict: string;
  confidence: number;
  reference: string | null;
  paidAt: string | null;
  createdAt: string;
  hasMedia: boolean;
  extracted: PaymentEvidence;
};

export type PaymentInboxItem = {
  id: string;
  conversationId: string;
  customerPhone: string;
  customerName: string | null;
  status: string;
  statusReason: string | null;
  expectedAmount: number | null;
  receivedAmount: number | null;
  remaining: number | null;
  catalogItem: { name: string; price: number; currency: string } | null;
  latestProof: PaymentProofSummary | null;
  aiMessage: string | null;
  confirmedById: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentAuditEntryItem = {
  id: string;
  actor: string;
  action: string;
  detail: unknown;
  createdAt: string;
};

export type PaymentDetail = PaymentInboxItem & {
  proofs: PaymentProofSummary[];
  auditEntries: PaymentAuditEntryItem[];
};
