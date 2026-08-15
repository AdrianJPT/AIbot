import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentSessionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  cleanupOwnershipFixtures,
  createTestBusinessWithNumber,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";
import {
  buildInboundDocumentPayload,
  buildInboundImagePayload,
} from "@/lib/__tests__/fixtures/webhook-payload";

/**
 * End-to-end coverage for tasks #568 PR2 phase 3/4: webhook ingest ->
 * payments/ingest.ts's flag gate -> PaymentSession/PaymentAnalysisEvent ->
 * the inline analysis drain (payments/analysis-job.ts) -> the state-machine
 * transition — going through the real `processWebhookPayload` entry point,
 * same shape as dispatch-resumability.test.ts. Only the AI/WhatsApp
 * boundary is mocked; `../db`, `../message-handler`, `../payments/*` are
 * all real.
 */

const downloadMediaBuffer = vi.fn();
const describeImageFromBuffer = vi.fn();
const extractPaymentEvidence = vi.fn();
vi.mock("../media", () => ({
  downloadMediaBuffer: (...args: unknown[]) => downloadMediaBuffer(...args),
  describeImageFromBuffer: (...args: unknown[]) =>
    describeImageFromBuffer(...args),
  extractPaymentEvidence: (...args: unknown[]) =>
    extractPaymentEvidence(...args),
}));

const generateResponse = vi.fn();
vi.mock("../ai/generate", () => ({
  generateResponse: (...args: unknown[]) => generateResponse(...args),
}));

vi.mock("../ai/resolve", () => ({
  callWithAiCredential: (
    _business: unknown,
    fn: (client: unknown) => unknown,
  ) => fn({ marker: "fake-ai-client" }),
  resolveModels: async () => ({
    chatModel: "gpt-4o-mini",
    visionModel: "gpt-4o-mini",
    audioModel: "whisper-1",
  }),
}));

const sendFromNumber = vi.fn();
vi.mock("../whatsapp", () => ({
  sendFromNumber: (...args: unknown[]) => sendFromNumber(...args),
  resolveWhatsappToken: vi.fn().mockResolvedValue("test-token"),
}));

const logEvent = vi.fn();
vi.mock("../log", () => ({
  logEvent: (...args: unknown[]) => logEvent(...args),
}));

const { processWebhookPayload } = await import("../message-handler");

const VALID_EVIDENCE = {
  amount: 15000,
  currency: "MXN",
  paidAt: null,
  reference: null,
  destinationAccount: null,
  payerName: null,
  transferStatus: "completed" as const,
  tamperingScore: 0,
  imageHash: null,
  confidence: 0.95,
};

const ownerIds: string[] = [];

afterAll(async () => {
  await cleanupOwnershipFixtures(ownerIds);
});

let wamidSeq = 0;
let phoneSeq = 0;
let customerSeq = 0;
// Module-scope (not per-test/beforeEach): Message.wamid is unique across the
// whole table, and a single test can trigger more than one outbound send
// (the normal conversational reply plus a payment-driver follow-up), so the
// counter must survive across every mocked sendFromNumber call within the
// same test, not just reset once per test.
let outboundSeq = 0;

beforeEach(() => {
  vi.clearAllMocks();
  wamidSeq += 1;
  phoneSeq += 1;
  customerSeq += 1;
  // Buffer content varies by media id so two distinct proofs never hash to
  // the same imageHash by test-fixture accident — the real download always
  // returns distinct bytes per media id, and the duplicate-image dedup check
  // (verdict.ts) is exercised deliberately, not incidentally, elsewhere.
  downloadMediaBuffer.mockImplementation((mediaId: string) =>
    Promise.resolve({
      buffer: Buffer.from(`fake-proof-bytes-${mediaId}`),
      mimeType: "image/jpeg",
    }),
  );
  describeImageFromBuffer.mockResolvedValue("Una foto de un comprobante");
  extractPaymentEvidence.mockResolvedValue(VALID_EVIDENCE);
  sendFromNumber.mockImplementation(() =>
    Promise.resolve(`wamid.OUTBOUND_TEST_${wamidSeq}_${++outboundSeq}`),
  );
});

async function setupBusiness(
  suffix: string,
  paymentsEnabled: boolean,
) {
  const user = await createTestUser(`payment-ingest-${suffix}`);
  ownerIds.push(user.id);
  const business = await createTestBusinessWithNumber(user.id, suffix, {
    replyWindowMs: 0,
    paymentsEnabled,
  });
  return { business, phoneNumber: business.phoneNumbers[0] };
}

describe("payment ingest integration (real DB, mocked AI)", () => {
  it("is a flag-gated no-op when paymentsEnabled is false: no PaymentSession/Proof/AnalysisEvent is created", async () => {
    const { business, phoneNumber } = await setupBusiness("flag-off", false);
    const from = `52155${customerSeq}0000001`;

    await processWebhookPayload(
      buildInboundImagePayload({
        phoneNumberId: phoneNumber.phoneNumberId,
        from,
        wamid: `wamid.FLAG_OFF_${wamidSeq}`,
        mediaId: "MEDIA_FLAG_OFF",
      }),
    );

    const conversation = await prisma.conversation.findFirstOrThrow({
      where: { businessId: business.id, customerPhone: from },
    });
    expect(
      (
        await prisma.message.findMany({
          where: { conversationId: conversation.id },
        })
      ).length,
    ).toBe(1); // the customer's image message is still persisted normally

    const sessions = await prisma.paymentSession.findMany({
      where: { businessId: business.id },
    });
    expect(sessions).toHaveLength(0);
    // extractPaymentEvidence must never even be called when the flag is off.
    expect(extractPaymentEvidence).not.toHaveBeenCalled();
  });

  it("an image proof with no open session creates a PaymentSession, analyzes inline, and reaches ready_to_confirm", async () => {
    const { business, phoneNumber } = await setupBusiness("image-new", true);
    const from = `52155${customerSeq}0000002`;

    await processWebhookPayload(
      buildInboundImagePayload({
        phoneNumberId: phoneNumber.phoneNumberId,
        from,
        wamid: `wamid.IMG_NEW_${wamidSeq}`,
        mediaId: "MEDIA_IMG_NEW",
      }),
    );

    const session = await prisma.paymentSession.findFirstOrThrow({
      where: { businessId: business.id },
    });
    expect(session.status).toBe(PaymentSessionStatus.ready_to_confirm);

    const proof = await prisma.paymentProof.findFirstOrThrow({
      where: { sessionId: session.id },
    });
    expect(proof.waMediaId).toBe("MEDIA_IMG_NEW");
    expect(proof.verdict).toBe("valid");

    const auditActions = (
      await prisma.paymentAuditEntry.findMany({ where: { sessionId: session.id } })
    ).map((a) => a.action);
    expect(auditActions).toContain("proof_received");
  });

  it("an image proof attaches to an already-open PaymentSession instead of creating a second one", async () => {
    const { business, phoneNumber } = await setupBusiness("image-attach", true);
    const from = `52155${customerSeq}0000003`;

    // First proof: bad verdict, keeps the session open in customer_action.
    extractPaymentEvidence.mockResolvedValueOnce({
      ...VALID_EVIDENCE,
      tamperingScore: 0.9,
    });
    await processWebhookPayload(
      buildInboundImagePayload({
        phoneNumberId: phoneNumber.phoneNumberId,
        from,
        wamid: `wamid.IMG_ATTACH_1_${wamidSeq}`,
        mediaId: "MEDIA_IMG_ATTACH_1",
      }),
    );

    const afterFirst = await prisma.paymentSession.findMany({
      where: { businessId: business.id },
    });
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0].status).toBe(PaymentSessionStatus.customer_action);

    // Second proof, same conversation: attaches to the same session.
    extractPaymentEvidence.mockResolvedValueOnce(VALID_EVIDENCE);
    await processWebhookPayload(
      buildInboundImagePayload({
        phoneNumberId: phoneNumber.phoneNumberId,
        from,
        wamid: `wamid.IMG_ATTACH_2_${wamidSeq}`,
        mediaId: "MEDIA_IMG_ATTACH_2",
      }),
    );

    const sessions = await prisma.paymentSession.findMany({
      where: { businessId: business.id },
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(afterFirst[0].id);
    expect(sessions[0].status).toBe(PaymentSessionStatus.ready_to_confirm);
    // The autonomy round spent on the customer's resubmission.
    expect(sessions[0].autonomyRounds).toBe(2);

    const proofs = await prisma.paymentProof.findMany({
      where: { sessionId: sessions[0].id },
    });
    expect(proofs).toHaveLength(2);
  });

  it("a document (PDF) proof is downloaded and analyzed the same way as an image", async () => {
    const { business, phoneNumber } = await setupBusiness("document-new", true);
    const from = `52155${customerSeq}0000004`;
    downloadMediaBuffer.mockResolvedValue({
      buffer: Buffer.from("%PDF-1.4 fake"),
      mimeType: "application/pdf",
    });

    await processWebhookPayload(
      buildInboundDocumentPayload({
        phoneNumberId: phoneNumber.phoneNumberId,
        from,
        wamid: `wamid.DOC_NEW_${wamidSeq}`,
        mediaId: "MEDIA_DOC_NEW",
      }),
    );

    const session = await prisma.paymentSession.findFirstOrThrow({
      where: { businessId: business.id },
    });
    const proof = await prisma.paymentProof.findFirstOrThrow({
      where: { sessionId: session.id },
    });
    expect(proof.waMediaId).toBe("MEDIA_DOC_NEW");
    expect(proof.verdict).toBe("valid");
    expect(extractPaymentEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ id: business.id }),
      expect.any(Buffer),
      "application/pdf",
    );

    // The document's chat-facing content is unchanged by this slice — the
    // download only happens for payment analysis, never inline for the
    // conversational reply.
    const message = await prisma.message.findFirstOrThrow({
      where: { conversationId: session.conversationId, mediaType: "document" },
    });
    expect(message.content).toBe("[Documento adjunto]");
  });

  it("a genuinely non-proof image (invalid verdict: no amount, decent confidence) creates no owner-visible ready_to_confirm row", async () => {
    const { business, phoneNumber } = await setupBusiness("non-proof", true);
    const from = `52155${customerSeq}0000005`;
    // A confident model that read the image and found no amount at all —
    // e.g. an unrelated photo. Distinct from the low-confidence/malformed
    // case (see the "malformed extraction" test), which routes through the
    // needs_attention/low_confidence branch instead.
    extractPaymentEvidence.mockResolvedValue({
      ...VALID_EVIDENCE,
      amount: null,
      confidence: 0.85,
    });

    await processWebhookPayload(
      buildInboundImagePayload({
        phoneNumberId: phoneNumber.phoneNumberId,
        from,
        wamid: `wamid.NON_PROOF_${wamidSeq}`,
        mediaId: "MEDIA_NON_PROOF",
      }),
    );

    const session = await prisma.paymentSession.findFirstOrThrow({
      where: { businessId: business.id },
    });
    expect(session.status).not.toBe(PaymentSessionStatus.ready_to_confirm);
    expect(session.status).not.toBe(PaymentSessionStatus.confirmed);

    const proof = await prisma.paymentProof.findFirstOrThrow({
      where: { sessionId: session.id },
    });
    expect(proof.verdict).toBe("invalid");
  });

  it("malformed/unreadable extraction (null) routes to a low-confidence review, never a crash and never a computed verdict from garbage data", async () => {
    const { business, phoneNumber } = await setupBusiness(
      "malformed-extraction",
      true,
    );
    const from = `52155${customerSeq}0000006`;
    extractPaymentEvidence.mockResolvedValue(null); // unparseable/schema-invalid model output

    await processWebhookPayload(
      buildInboundImagePayload({
        phoneNumberId: phoneNumber.phoneNumberId,
        from,
        wamid: `wamid.MALFORMED_${wamidSeq}`,
        mediaId: "MEDIA_MALFORMED",
      }),
    );

    const session = await prisma.paymentSession.findFirstOrThrow({
      where: { businessId: business.id },
    });
    const proof = await prisma.paymentProof.findFirstOrThrow({
      where: { sessionId: session.id },
    });
    // A null extraction is never trusted as "valid" or "confirmed" — it is
    // routed to a flagged review (needs_attention/low_confidence), the same
    // safety-valve destination the spec's "Low confidence" scenario
    // describes, never straight to the owner's clean-confirm state.
    expect(proof.confidence).toBe(0);
    expect(proof.verdict).toBe("needs_attention");
    expect(session.statusReason).toBe("low_confidence");
    expect(session.status).not.toBe(PaymentSessionStatus.confirmed);
  });
});
