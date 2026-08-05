import { describe, expect, it } from "vitest";
import {
  DEFAULT_REPLY_WINDOW_MS,
  replyWindowMsFromSeconds,
} from "../reply-window";

describe("reply window form conversion", () => {
  it("uses five seconds when the form value is missing or blank", () => {
    expect(replyWindowMsFromSeconds(null)).toBe(DEFAULT_REPLY_WINDOW_MS);
    expect(replyWindowMsFromSeconds("")).toBe(DEFAULT_REPLY_WINDOW_MS);
  });

  it("preserves an explicit zero", () => {
    expect(replyWindowMsFromSeconds("0")).toBe(0);
  });

  it("converts seconds to milliseconds and clamps the supported range", () => {
    expect(replyWindowMsFromSeconds("5")).toBe(5_000);
    expect(replyWindowMsFromSeconds("301")).toBe(300_000);
  });
});
