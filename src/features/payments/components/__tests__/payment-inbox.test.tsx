import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PaymentInboxItem } from "@/features/payments/types";
import { PaymentInbox } from "../payment-inbox";

function renderInbox(items: PaymentInboxItem[]) {
  return renderToStaticMarkup(
    <PaymentInbox
      items={items}
      busyId={null}
      onConfirm={() => {}}
      onConfirmPartial={() => {}}
      onReject={() => {}}
    />,
  );
}

const baseItem: PaymentInboxItem = {
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
    extracted: null,
  },
  aiMessage: null,
  confirmedById: null,
  confirmedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("PaymentInbox", () => {
  it("shows an empty state when there are no ready_to_confirm sessions", () => {
    const html = renderInbox([]);
    expect(html).toContain("No hay pagos pendientes de confirmar");
  });

  it("shows the customer, verdict badge, and a preview link when media exists", () => {
    const html = renderInbox([baseItem]);
    expect(html).toContain("Cliente Test");
    expect(html).toContain("Válido");
    expect(html).toContain("/api/payments/session-1/media/proof-1");
    expect(html).toContain("/conversations/conv-1");
  });

  it("shows the confirm-as-partial action for a flagged partial session", () => {
    const partialItem: PaymentInboxItem = {
      ...baseItem,
      statusReason: "partial",
      remaining: 5000,
    };
    const html = renderInbox([partialItem]);
    expect(html).toContain("Confirmar parcial");
    expect(html).not.toContain(">Confirmar<");
  });
});
