import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentHandoffMarker } from "../payment-handoff-marker";

describe("PaymentHandoffMarker", () => {
  it("shows a 'payments' handoff marker linking to the payments dashboard", () => {
    const html = renderToStaticMarkup(<PaymentHandoffMarker />);
    expect(html).toContain("Pago escalado");
    expect(html).toContain('href="/payments"');
  });
});
