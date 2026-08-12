import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentSessionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  cleanupOwnershipFixtures,
  createTestBusinessWithNumber,
  createTestConversation,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";
import { resolveExpiresAt } from "../state-machine";

/**
 * Integration coverage for the analysis job (tasks #568 PR2 phase 2/4):
 * ingest's `PaymentSession` + a customer `Message` are seeded directly
 * (mirrors how `payments/ingest.ts` would have created them), then
 * `processPaymentAnalysisEvent` is called directly against the real test
 * Postgres — only the AI/WhatsApp boundary is mocked (media download +
 * extraction, `resolveWhatsappToken`, and `message-handler.ts`'s
 * `sendAndPersistReply`), same pattern as dispatch-resumability.test.ts.
 */

const downloadMediaBuffer = vi.fn();
const extractPaymentEvidence = vi.fn();
vi.mock("../../media", () => ({
  downloadMediaBuffer: (...args: unknown[]) => downloadMediaBuffer(...args),
  extractPaymentEvidence: (...args: unknown[]) => extractPaymentEvidence(...args),
}));

vi.mock("../../whatsapp", () => ({
  resolveWhatsappToken: vi.fn().mockResolvedValue("test-token"),
  sendFromNumber: vi.fn(),
}));

const sendAndPersistReply = vi.fn().mockResolvedValue(undefined);
vi.mock("../../message-handler", () => ({
  sendAndPersistReply: (...args: unknown[]) => sendAndPersistReply(...args),
}));

const logEvent = vi.fn();
vi.mock("../../log", () => ({
  logEvent: (...args: unknown[]) => logEvent(...args),
}));

const { processPaymentAnalysisEvent } = await import("../analysis-job");

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

beforeEach(() => {
  vi.clearAllMocks();
  sendAndPersistReply.mockResolvedValue(undefined);
  downloadMediaBuffer.mockResolvedValue({
    buffer: Buffer.from("fake-proof-bytes"),
    mimeType: "image/jpeg",
  });
});

async function setupBusiness(suffix: string) {
  const user = await createTestUser(`analysis-job-${suffix}`);
  ownerIds.push(user.id);
  const business = await createTestBusinessWithNumber(user.id, suffix, {
    paymentsEnabled: true,
  });
  return { business, phoneNumber: business.phoneNumbers[0] };
}

async function seedSessionAndMessage(
  suffix: string,
  overrides: Partial<{
    status: PaymentSessionStatus;
    autonomyRounds: number;
    expectedAmount: number | null;
  }> = {},
) {
  const { business, phoneNumber } = await setupBusiness(suffix);
  const conversation = await createTestConversation(business.id, suffix);
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "user",
      content: "[Imagen del cliente]",
      mediaType: "image",
      sentBy: "customer",
    },
  });
  const session = await prisma.paymentSession.create({
    data: {
      businessId: business.id,
      conversationId: conversation.id,
      customerPhone: conversation.customerPhone,
      status: overrides.status ?? PaymentSessionStatus.awaiting_proof,
      autonomyRounds: overrides.autonomyRounds ?? 3,
      expectedAmount: overrides.expectedAmount ?? null,
      expiresAt: resolveExpiresAt(new Date()),
    },
  });

  return { business, phoneNumber, conversation, message, session };
}

function payloadFor(opts: {
  business: { id: string };
  phoneNumber: { id: string };
  session: { id: string };
  message: { id: string };
  mediaType?: "image" | "document";
}) {
  return {
    sessionId: opts.session.id,
    messageId: opts.message.id,
    waMediaId: "wamedia_test",
    businessId: opts.business.id,
    phoneNumberId: opts.phoneNumber.id,
    mediaType: opts.mediaType ?? ("image" as const),
  };
}

describe("processPaymentAnalysisEvent (real DB, mocked AI)", () => {
  it("valid verdict moves an awaiting_proof session to ready_to_confirm and writes a proof + audit trail", async () => {
    extractPaymentEvidence.mockResolvedValue(VALID_EVIDENCE);
    const { business, phoneNumber, session, message } =
      await seedSessionAndMessage("valid-1", { expectedAmount: 15000 });

    await processPaymentAnalysisEvent(
      payloadFor({ business, phoneNumber, session, message }),
    );

    const reloadedSession = await prisma.paymentSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(reloadedSession.status).toBe(PaymentSessionStatus.ready_to_confirm);
    expect(reloadedSession.statusReason).toBeNull();

    const proof = await prisma.paymentProof.findFirstOrThrow({
      where: { messageId: message.id },
    });
    expect(proof.verdict).toBe("valid");
    expect(proof.sessionId).toBe(session.id);

    const audit = await prisma.paymentAuditEntry.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.map((a) => a.action)).toEqual([
      "proof_received",
      "transition:awaiting_proof->analyzing",
      "transition:analyzing->ready_to_confirm",
    ]);

    // A `valid` verdict never needs a customer follow-up message.
    expect(sendAndPersistReply).not.toHaveBeenCalled();
  });

  it("a partial-amount (needs_attention) verdict also lands in ready_to_confirm, flagged", async () => {
    extractPaymentEvidence.mockResolvedValue({ ...VALID_EVIDENCE, amount: 5000 });
    const { business, phoneNumber, session, message } =
      await seedSessionAndMessage("partial-1", { expectedAmount: 15000 });

    await processPaymentAnalysisEvent(
      payloadFor({ business, phoneNumber, session, message }),
    );

    const reloadedSession = await prisma.paymentSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(reloadedSession.status).toBe(PaymentSessionStatus.ready_to_confirm);
    expect(reloadedSession.statusReason).toBe("partial");
  });

  it("a suspicious verdict moves the session to customer_action and sends a customer message", async () => {
    extractPaymentEvidence.mockResolvedValue({
      ...VALID_EVIDENCE,
      tamperingScore: 0.9,
    });
    const { business, phoneNumber, session, message } =
      await seedSessionAndMessage("suspicious-1");

    await processPaymentAnalysisEvent(
      payloadFor({ business, phoneNumber, session, message }),
    );

    const reloadedSession = await prisma.paymentSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(reloadedSession.status).toBe(PaymentSessionStatus.customer_action);
    expect(reloadedSession.statusReason).toBe("tampering");
    // Autonomy rounds are untouched on the *first* proof: the round budget
    // is only spent when the customer responds and re-submits (see the
    // "consumes an autonomy round" test below).
    expect(reloadedSession.autonomyRounds).toBe(3);

    expect(sendAndPersistReply).toHaveBeenCalledTimes(1);
    const [, , conversationId, customerPhone, content] =
      sendAndPersistReply.mock.calls[0];
    expect(conversationId).toBe(session.conversationId);
    expect(customerPhone).toBe(session.customerPhone);
    expect(typeof content).toBe("string");
  });

  it("processes a document proof (PDF) the same way as an image", async () => {
    extractPaymentEvidence.mockResolvedValue(VALID_EVIDENCE);
    downloadMediaBuffer.mockResolvedValue({
      buffer: Buffer.from("%PDF-1.4 fake"),
      mimeType: "application/pdf",
    });
    const { business, phoneNumber, session, message } =
      await seedSessionAndMessage("document-1", { expectedAmount: 15000 });

    await processPaymentAnalysisEvent(
      payloadFor({ business, phoneNumber, session, message, mediaType: "document" }),
    );

    const proof = await prisma.paymentProof.findFirstOrThrow({
      where: { messageId: message.id },
    });
    expect(proof.verdict).toBe("valid");
    expect(extractPaymentEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ id: business.id }),
      expect.any(Buffer),
      "application/pdf",
    );
  });

  it("routes an invalid (non-proof) image to customer_action with no owner-visible ready_to_confirm row", async () => {
    extractPaymentEvidence.mockResolvedValue(null); // malformed/garbage extraction
    const { business, phoneNumber, session, message } =
      await seedSessionAndMessage("invalid-1");

    await processPaymentAnalysisEvent(
      payloadFor({ business, phoneNumber, session, message }),
    );

    const reloadedSession = await prisma.paymentSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    // A null extraction is routed as confidence 0 -> low_confidence, which
    // is a needs_attention verdict (ready_to_confirm), not invalid — but
    // either way this MUST NOT reach ready_to_confirm-with-a-real-amount:
    // the session never confirms itself, only an owner action can.
    expect(reloadedSession.status).not.toBe(PaymentSessionStatus.confirmed);
  });

  it("is idempotent by proof id: a second call for the same messageId does not create a duplicate proof or re-transition the session", async () => {
    extractPaymentEvidence.mockResolvedValue(VALID_EVIDENCE);
    const { business, phoneNumber, session, message } =
      await seedSessionAndMessage("idempotent-1", { expectedAmount: 15000 });
    const payload = payloadFor({ business, phoneNumber, session, message });

    await processPaymentAnalysisEvent(payload);
    await processPaymentAnalysisEvent(payload);

    const proofs = await prisma.paymentProof.findMany({
      where: { messageId: message.id },
    });
    expect(proofs).toHaveLength(1);

    const reloadedSession = await prisma.paymentSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(reloadedSession.status).toBe(PaymentSessionStatus.ready_to_confirm);

    // The second, skipped call must not have re-downloaded or re-extracted.
    expect(downloadMediaBuffer).toHaveBeenCalledTimes(1);
    expect(extractPaymentEvidence).toHaveBeenCalledTimes(1);
  });

  it("never counts a duplicate reference twice: a repeated reference verdicts as duplicate", async () => {
    const { business, phoneNumber, session } = await seedSessionAndMessage(
      "duplicate-1",
    );
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: session.conversationId },
    });
    const firstMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: "[Imagen del cliente]",
        mediaType: "image",
        sentBy: "customer",
      },
    });
    const secondMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: "[Imagen del cliente]",
        mediaType: "image",
        sentBy: "customer",
      },
    });

    extractPaymentEvidence.mockResolvedValueOnce({
      ...VALID_EVIDENCE,
      reference: "OP-DUP-1",
    });
    await processPaymentAnalysisEvent(
      payloadFor({ business, phoneNumber, session, message: firstMessage }),
    );

    // Second session for the resend, same business — dedup is scoped to the
    // whole business per spec, not to one session.
    const secondSession = await prisma.paymentSession.create({
      data: {
        businessId: business.id,
        conversationId: conversation.id,
        customerPhone: conversation.customerPhone,
        expiresAt: resolveExpiresAt(new Date()),
      },
    });
    extractPaymentEvidence.mockResolvedValueOnce({
      ...VALID_EVIDENCE,
      reference: "OP-DUP-1",
    });
    await processPaymentAnalysisEvent(
      payloadFor({
        business,
        phoneNumber,
        session: secondSession,
        message: secondMessage,
      }),
    );

    const secondProof = await prisma.paymentProof.findFirstOrThrow({
      where: { messageId: secondMessage.id },
    });
    expect(secondProof.verdict).toBe("duplicate");
  });

  describe("autonomy budget", () => {
    it("consumes an autonomy round when the customer resubmits from customer_action", async () => {
      extractPaymentEvidence.mockResolvedValue({
        ...VALID_EVIDENCE,
        tamperingScore: 0.9,
      });
      const { business, phoneNumber, session, message } =
        await seedSessionAndMessage("autonomy-consume-1", {
          status: PaymentSessionStatus.customer_action,
          autonomyRounds: 3,
        });

      await processPaymentAnalysisEvent(
        payloadFor({ business, phoneNumber, session, message }),
      );

      const reloaded = await prisma.paymentSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      expect(reloaded.autonomyRounds).toBe(2);
      expect(reloaded.status).toBe(PaymentSessionStatus.customer_action);
    });

    it("escalates once autonomyRounds is exhausted, instead of looping forever", async () => {
      extractPaymentEvidence.mockResolvedValue({
        ...VALID_EVIDENCE,
        tamperingScore: 0.9,
      });
      const { business, phoneNumber, session, message } =
        await seedSessionAndMessage("autonomy-exhausted-1", {
          status: PaymentSessionStatus.customer_action,
          autonomyRounds: 0,
        });

      await processPaymentAnalysisEvent(
        payloadFor({ business, phoneNumber, session, message }),
      );

      const reloaded = await prisma.paymentSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      expect(reloaded.status).toBe(PaymentSessionStatus.escalated);
      expect(reloaded.statusReason).toBe("autonomy_exhausted");
      expect(sendAndPersistReply).toHaveBeenCalledTimes(1);
    });

    it("low extraction confidence escalates to the owner regardless of other signals (lands in ready_to_confirm, flagged)", async () => {
      extractPaymentEvidence.mockResolvedValue({
        ...VALID_EVIDENCE,
        confidence: 0.2,
      });
      const { business, phoneNumber, session, message } =
        await seedSessionAndMessage("low-confidence-1", { expectedAmount: 15000 });

      await processPaymentAnalysisEvent(
        payloadFor({ business, phoneNumber, session, message }),
      );

      const reloaded = await prisma.paymentSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      expect(reloaded.status).toBe(PaymentSessionStatus.ready_to_confirm);
      expect(reloaded.statusReason).toBe("low_confidence");
    });
  });
});
