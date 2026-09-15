import { describe, expect, it } from "vitest";
import { formatUtcDayShort } from "../format-day";

describe("formatUtcDayShort", () => {
  it("formats a day key as a short UTC date", () => {
    expect(formatUtcDayShort("2026-09-12")).toMatch(/12/);
  });

  it("stays on the same UTC day across a month boundary", () => {
    // 2026-08-31T00:00:00Z must read as August 31, never rolling to Sep 1
    // under a local timezone west of UTC.
    expect(formatUtcDayShort("2026-08-31")).toMatch(/31/);
  });
});
