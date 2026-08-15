import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PaymentDetail } from "@/features/payments/types";
import { PaymentCard } from "../payment-card";

function renderCard(detail: PaymentDetail) {
  return renderToStaticMarkup(
    <PaymentCard
      detail={detail}
      busy={false}
      onConfirm={() => {}}
      onConfirmPartial={() => {}}
      onReject={() => {}}
    />,
  );
}

const baseDetail: PaymentDetail = {
  id: "session-1",
  conversationId: "conv-1",
  customerPhone: "+5491100000000",
  customerName: "Cliente Test",
  status: "ready_to_confirm",
  statusReason: null,
  expectedAmount: 20000,
  receivedAmount: 20000,
  remaining: 0,
  catalogItem: { name: "Corte", price: 20000, currency: "MXN" },
  latestProof: {
    id: "proof-1",
    verdict: "valid",
    confidence: 0.95,
    reference: "REF123",
    paidAt: null,
    createdAt: new Date().toISOString(),
    hasMedia: true,
    extracted: {
      amount: 20000,
      currency: "MXN",
      paidAt: null,
      reference: "REF123",
      destinationAccount: null,
      payerName: "Juan Pérez",
      transferStatus: "completed",
      tamperingScore: null,
      imageHash: null,
      confidence: 0.95,
    },
  },
  aiMessage: null,
  confirmedById: null,
  confirmedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  proofs: [],
  auditEntries: [
    {
      id: "audit-1",
      actor: "system",
      action: "transition:analyzing->ready_to_confirm",
      detail: null,
      createdAt: new Date().toISOString(),
    },
  ],
};

describe("PaymentCard", () => {
  it("shows the verdict badge, extracted data, and confirm/reject actions for a ready_to_confirm session", () => {
    const html = renderCard(baseDetail);
    expect(html).toContain("Válido");
    expect(html).toContain("REF123");
    expect(html).toContain("Juan Pérez");
    expect(html).toContain(">Confirmar<");
    expect(html).toContain("Rechazar");
    expect(html).toContain("/api/payments/session-1/media/proof-1");
  });

  it("shows the confirm-as-partial action for a flagged partial session (same copy as the dashboard inbox)", () => {
    const html = renderCard({
      ...baseDetail,
      statusReason: "partial",
      remaining: 5000,
    });
    expect(html).toContain("Confirmar parcial");
    expect(html).not.toContain(">Confirmar<");
  });

  it("hides confirm/reject once the session has moved past ready_to_confirm", () => {
    const html = renderCard({
      ...baseDetail,
      status: "confirmed",
      confirmedAt: new Date().toISOString(),
      confirmedById: "user-1",
    });
    expect(html).not.toContain(">Confirmar<");
    expect(html).not.toContain("Rechazar");
    expect(html).toContain("Confirmado el");
  });

  it("renders the audit trail toggle (auditability, tasks #568 PR4 task 3)", () => {
    const html = renderCard(baseDetail);
    expect(html).toContain("Ver historial de auditoría");
  });
});
