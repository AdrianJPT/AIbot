import { describe, expect, it } from "vitest";
import { canRetryFailedMessage, sendFailureCopy } from "../send-failure-copy";

describe("sendFailureCopy", () => {
  it("returns cause-specific copy for window_expired", () => {
    const copy = sendFailureCopy("window_expired");
    expect(copy.title).toContain("24 horas");
    expect(copy.retryLabel).toBe("Reintento no disponible");
  });

  it("returns cause-specific copy for auth", () => {
    const copy = sendFailureCopy("auth");
    expect(copy.title).toContain("autenticación");
    expect(copy.retryLabel).toBe("Reintentar");
  });

  it("returns cause-specific copy for rate_limit", () => {
    const copy = sendFailureCopy("rate_limit");
    expect(copy.title).toContain("límite");
    expect(copy.retryLabel).toBe("Reintentar");
  });

  it("returns cause-specific copy for invalid_recipient", () => {
    const copy = sendFailureCopy("invalid_recipient");
    expect(copy.title).toContain("número de destino");
    expect(copy.retryLabel).toBe("Reintentar");
  });

  it("returns generic copy for unknown", () => {
    const copy = sendFailureCopy("unknown");
    expect(copy.title).toBe("No se pudo entregar");
    expect(copy.retryLabel).toBe("Reintentar");
  });

  it("maps an invalid or unrecognized DB string to unknown copy", () => {
    const copy = sendFailureCopy("some-legacy-value-not-in-the-union");
    expect(copy).toEqual(sendFailureCopy("unknown"));
  });

  it("maps a null code to unknown copy", () => {
    expect(sendFailureCopy(null)).toEqual(sendFailureCopy("unknown"));
  });

  it("maps an undefined code to unknown copy", () => {
    expect(sendFailureCopy(undefined)).toEqual(sendFailureCopy("unknown"));
  });

  it("gives every recognized code a distinct title from the generic fallback", () => {
    const titles = [
      "window_expired",
      "auth",
      "rate_limit",
      "invalid_recipient",
    ].map((code) => sendFailureCopy(code).title);
    const unique = new Set(titles);
    expect(unique.size).toBe(titles.length);
    expect(titles).not.toContain(sendFailureCopy("unknown").title);
  });
});

describe("canRetryFailedMessage", () => {
  it("allows retry for an outbound failed message with a non-window code", () => {
    expect(
      canRetryFailedMessage({
        role: "assistant",
        status: "failed",
        failureCode: "rate_limit",
      }),
    ).toBe(true);
  });

  it("allows retry for an outbound failed message with no failureCode (unknown)", () => {
    expect(
      canRetryFailedMessage({
        role: "assistant",
        status: "failed",
        failureCode: undefined,
      }),
    ).toBe(true);
  });

  it("denies retry when the failure code is window_expired", () => {
    expect(
      canRetryFailedMessage({
        role: "assistant",
        status: "failed",
        failureCode: "window_expired",
      }),
    ).toBe(false);
  });

  it("denies retry when the message is not failed", () => {
    expect(
      canRetryFailedMessage({
        role: "assistant",
        status: "sent",
        failureCode: null,
      }),
    ).toBe(false);
  });

  it("denies retry for an inbound (customer) message", () => {
    expect(
      canRetryFailedMessage({
        role: "user",
        status: "failed",
        failureCode: "auth",
      }),
    ).toBe(false);
  });
});
