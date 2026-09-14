import { describe, expect, it } from "vitest";
import {
  ChannelSendError,
  sanitizeFailureDetail,
  sendFailureFromError,
} from "@/lib/channels/send-failure";

describe("sanitizeFailureDetail", () => {
  it("returns null for null input", () => {
    expect(sanitizeFailureDetail(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(sanitizeFailureDetail(undefined)).toBeNull();
  });

  it("redacts a digit run of 7 or more characters", () => {
    expect(
      sanitizeFailureDetail("Recipient 5215512345678 not on WhatsApp"),
    ).toBe("Recipient [redacted] not on WhatsApp");
  });

  it("does not redact a digit run shorter than 7 characters", () => {
    expect(sanitizeFailureDetail("Error code 404 occurred")).toBe(
      "Error code 404 occurred",
    );
  });

  it("redacts a Bearer token", () => {
    expect(
      sanitizeFailureDetail("Auth failed with Bearer EAAGm0PX4ZCpsBO token"),
    ).toBe("Auth failed with [redacted] token");
  });

  it("redacts an access_token value", () => {
    expect(
      sanitizeFailureDetail("Request had access_token=EAAGm0PX4ZCpsBO in it"),
    ).toBe("Request had [redacted] in it");
  });

  it("collapses whitespace and newlines into single spaces", () => {
    expect(sanitizeFailureDetail("Line one\n\n  Line   two\ttab")).toBe(
      "Line one Line two tab",
    );
  });

  it("truncates text longer than 300 characters and appends an ellipsis", () => {
    const long = "a".repeat(310);
    const result = sanitizeFailureDetail(long);
    expect(result).toHaveLength(301);
    expect(result?.endsWith("…")).toBe(true);
    expect(result?.slice(0, 300)).toBe("a".repeat(300));
  });

  it("leaves short, clean text unchanged", () => {
    expect(sanitizeFailureDetail("Recipient not in allowed list")).toBe(
      "Recipient not in allowed list",
    );
  });
});

describe("ChannelSendError", () => {
  it("carries the message, failure, and cause", () => {
    const cause = new Error("original axios error");
    const err = new ChannelSendError(
      "sendMessage failed: window expired",
      { code: "window_expired", detail: "Re-engagement message" },
      { cause },
    );

    expect(err.message).toBe("sendMessage failed: window expired");
    expect(err.failure).toEqual({
      code: "window_expired",
      detail: "Re-engagement message",
    });
    expect(err.cause).toBe(cause);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("sendFailureFromError", () => {
  it("returns the failure carried by a ChannelSendError unchanged", () => {
    const err = new ChannelSendError("boom", {
      code: "rate_limit",
      detail: "Too many requests",
    });

    expect(sendFailureFromError(err)).toEqual({
      code: "rate_limit",
      detail: "Too many requests",
    });
  });

  it("classifies a foreign, non-channel error as unknown with sanitized detail", () => {
    const err = new Error("connect ETIMEDOUT 1234567");

    expect(sendFailureFromError(err)).toEqual({
      code: "unknown",
      detail: "connect ETIMEDOUT [redacted]",
    });
  });

  it("classifies a non-Error thrown value as unknown with null detail", () => {
    expect(sendFailureFromError("just a string")).toEqual({
      code: "unknown",
      detail: null,
    });
  });
});
