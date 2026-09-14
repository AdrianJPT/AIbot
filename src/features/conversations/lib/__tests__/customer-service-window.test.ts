import { describe, expect, it } from "vitest";
import { customerServiceWindowState } from "../customer-service-window";

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date("2026-01-01T12:00:00.000Z");

describe("customerServiceWindowState", () => {
  it("is within window when the last inbound message is recent", () => {
    const lastInboundAt = new Date(NOW.getTime() - 1 * HOUR_MS);
    expect(customerServiceWindowState("whatsapp", lastInboundAt, NOW)).toBe(
      "within",
    );
  });

  it("is outside window when the last inbound message is older than 24h", () => {
    const lastInboundAt = new Date(NOW.getTime() - 25 * HOUR_MS);
    expect(customerServiceWindowState("whatsapp", lastInboundAt, NOW)).toBe(
      "outside",
    );
  });

  it("treats elapsed time exactly equal to 24h as outside the window", () => {
    const lastInboundAt = new Date(NOW.getTime() - 24 * HOUR_MS);
    expect(customerServiceWindowState("whatsapp", lastInboundAt, NOW)).toBe(
      "outside",
    );
  });

  it("is indeterminate when no inbound message was ever received", () => {
    expect(customerServiceWindowState("whatsapp", null, NOW)).toBe(
      "indeterminate",
    );
  });

  it("accepts an ISO date string for lastInboundAt", () => {
    const lastInboundAt = new Date(NOW.getTime() - 1 * HOUR_MS).toISOString();
    expect(customerServiceWindowState("whatsapp", lastInboundAt, NOW)).toBe(
      "within",
    );
  });
});
