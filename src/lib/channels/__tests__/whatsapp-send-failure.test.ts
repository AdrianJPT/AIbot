import { describe, expect, it } from "vitest";
import { classifyMetaError } from "@/lib/channels/whatsapp-send-failure";

describe("classifyMetaError", () => {
  describe("sync shape (response.data.error)", () => {
    it("maps 131047 to window_expired", () => {
      const result = classifyMetaError({
        error: {
          code: 131047,
          message: "Re-engagement message",
          error_data: { details: "More than 24 hours have passed" },
        },
      });

      expect(result.code).toBe("window_expired");
      expect(result.detail).toContain("More than 24 hours have passed");
    });

    it("maps 190 to auth", () => {
      const result = classifyMetaError({
        error: {
          code: 190,
          message: "Access token has expired",
          error_data: { details: "Token expired" },
        },
      });

      expect(result.code).toBe("auth");
    });

    it("maps a permission-class code inside 200-299 to auth", () => {
      const result = classifyMetaError({
        error: { code: 200, message: "Permission denied" },
      });

      expect(result.code).toBe("auth");
    });

    it("maps 4 to rate_limit", () => {
      const result = classifyMetaError({
        error: { code: 4, message: "Application request limit reached" },
      });

      expect(result.code).toBe("rate_limit");
    });

    it("maps 131026 to invalid_recipient", () => {
      const result = classifyMetaError({
        error: { code: 131026, message: "Message undeliverable" },
      });

      expect(result.code).toBe("invalid_recipient");
    });

    it("maps an unrecognized code to unknown, preserving sanitized detail", () => {
      const result = classifyMetaError({
        error: {
          code: 999999,
          message: "Some brand new Meta error",
          error_data: { details: "Recipient 5215512345678 unreachable" },
        },
      });

      expect(result.code).toBe("unknown");
      expect(result.detail).toContain("Some brand new Meta error");
      expect(result.detail).not.toContain("5215512345678");
      expect(result.detail).toContain("[redacted]");
    });
  });

  describe("async shape (an item from statuses[].errors[])", () => {
    it("maps 131047 to window_expired using title + message + details", () => {
      const result = classifyMetaError({
        code: 131047,
        title: "Re-engagement message",
        message:
          "Message failed to send because more than 24 hours have passed",
        error_data: { details: "More than 24 hours have passed" },
      });

      expect(result.code).toBe("window_expired");
      expect(result.detail).toContain("Re-engagement message");
    });

    it("maps 130429 to rate_limit", () => {
      const result = classifyMetaError({
        code: 130429,
        title: "Rate limit hit",
        message: "Too many messages sent",
      });

      expect(result.code).toBe("rate_limit");
    });

    it("maps 131021 to invalid_recipient", () => {
      const result = classifyMetaError({
        code: 131021,
        title: "Recipient cannot be sender",
        message: "Invalid recipient",
      });

      expect(result.code).toBe("invalid_recipient");
    });

    it("maps an unmapped async code to unknown with sanitized detail", () => {
      const result = classifyMetaError({
        code: 123456,
        title: "Unrecognized",
        message: "An unknown error occurred",
      });

      expect(result.code).toBe("unknown");
      expect(result.detail).toContain("Unrecognized");
    });
  });

  describe("missing or malformed body", () => {
    it("returns unknown with null detail for a network/timeout error with no body", () => {
      const result = classifyMetaError(undefined);

      expect(result).toEqual({ code: "unknown", detail: null });
    });

    it("returns unknown with null detail for a body with neither error nor code", () => {
      const result = classifyMetaError({ unrelated: true });

      expect(result).toEqual({ code: "unknown", detail: null });
    });
  });
});
