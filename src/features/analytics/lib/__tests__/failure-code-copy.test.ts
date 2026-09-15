import { describe, expect, it } from "vitest";
import { SEND_FAILURE_CODES } from "@/lib/channels/send-failure";
import { failureCodeLabel } from "../failure-code-copy";

describe("failureCodeLabel", () => {
  it("maps every SendFailureCode to a non-empty Spanish label, never the raw code", () => {
    for (const code of SEND_FAILURE_CODES) {
      const label = failureCodeLabel(code);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(code);
    }
  });

  it("gives window_expired and auth distinct, cause-specific labels", () => {
    expect(failureCodeLabel("window_expired")).toBe(
      "Ventana de 24 horas vencida",
    );
    expect(failureCodeLabel("auth")).toBe(
      "Error de autenticación con WhatsApp",
    );
    expect(failureCodeLabel("window_expired")).not.toBe(
      failureCodeLabel("auth"),
    );
  });

  it("falls back unknown causes to a generic label", () => {
    expect(failureCodeLabel("unknown")).toBe("Causa desconocida");
  });
});
