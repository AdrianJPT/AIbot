import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DeliveryHealth } from "@/lib/analytics/types";
import { DeliveryHealthPanel } from "../delivery-health-panel";

const allZero: DeliveryHealth = {
  byCode: {
    window_expired: 0,
    auth: 0,
    rate_limit: 0,
    invalid_recipient: 0,
    unknown: 0,
  },
  totalOutbound: 0,
  totalFailed: 0,
  failureRate: 0,
};

const mixed: DeliveryHealth = {
  byCode: {
    window_expired: 1,
    auth: 2,
    rate_limit: 0,
    invalid_recipient: 0,
    unknown: 1,
  },
  totalOutbound: 10,
  totalFailed: 4,
  failureRate: 0.4,
};

describe("DeliveryHealthPanel", () => {
  it("renders one row per failure cause, in Spanish, never the raw code", () => {
    const html = renderToStaticMarkup(<DeliveryHealthPanel health={mixed} />);

    expect(html).toContain("Ventana de 24 horas vencida");
    expect(html).toContain("Error de autenticación con WhatsApp");
    expect(html).toContain("Límite de envíos alcanzado");
    expect(html).toContain("Número de destino inválido");
    expect(html).toContain("Causa desconocida");
    expect(html).not.toContain("window_expired");
    expect(html).not.toContain("rate_limit");
    expect(html).not.toContain("invalid_recipient");
  });

  it("renders each cause's count and percentage as visible text, not color-only", () => {
    const html = renderToStaticMarkup(<DeliveryHealthPanel health={mixed} />);

    // auth: 2 of 4 failures = 50.0%
    expect(html).toContain("2 (50.0%)");
    // window_expired: 1 of 4 = 25.0%
    expect(html).toContain("1 (25.0%)");
    // rate_limit: 0 of 4 = 0.0%
    expect(html).toContain("0 (0.0%)");
  });

  it("is a list, not a pie — no SVG/canvas chart element", () => {
    const html = renderToStaticMarkup(<DeliveryHealthPanel health={mixed} />);

    expect(html).toContain('data-testid="delivery-health-breakdown"');
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<canvas");
  });

  it("shows every cause count and rate as zero when nothing failed (spec: no failures in range)", () => {
    const html = renderToStaticMarkup(<DeliveryHealthPanel health={allZero} />);

    expect(html).toContain("0 (0.0%)");
    expect(html).toContain("0.0%");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  });
});
