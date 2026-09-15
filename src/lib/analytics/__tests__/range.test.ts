import { describe, expect, it } from "vitest";
import {
  DEFAULT_ANALYTICS_RANGE_KEY,
  formatUtcRangeLabel,
  isAnalyticsRangeKey,
  resolveAnalyticsRange,
} from "../range";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("isAnalyticsRangeKey", () => {
  it("accepts exactly the two selectable range keys", () => {
    expect(isAnalyticsRangeKey("7d")).toBe(true);
    expect(isAnalyticsRangeKey("30d")).toBe(true);
  });

  it("rejects any other value — never open-ended (spec Range Selection)", () => {
    expect(isAnalyticsRangeKey("1y")).toBe(false);
    expect(isAnalyticsRangeKey("")).toBe(false);
    expect(isAnalyticsRangeKey("90d")).toBe(false);
  });
});

describe("DEFAULT_ANALYTICS_RANGE_KEY", () => {
  it("defaults to 30 days", () => {
    expect(DEFAULT_ANALYTICS_RANGE_KEY).toBe("30d");
  });
});

describe("resolveAnalyticsRange", () => {
  const now = new Date("2026-09-15T13:45:00.000Z");

  it("resolves '7d' to a 7-whole-day range ending at tomorrow's UTC midnight", () => {
    const range = resolveAnalyticsRange("7d", now);

    expect(range.end.toISOString()).toBe("2026-09-16T00:00:00.000Z");
    expect(range.start.toISOString()).toBe("2026-09-09T00:00:00.000Z");
    expect(range.end.getTime() - range.start.getTime()).toBe(7 * DAY_MS);
  });

  it("resolves '30d' to a 30-whole-day range ending at tomorrow's UTC midnight", () => {
    const range = resolveAnalyticsRange("30d", now);

    expect(range.end.toISOString()).toBe("2026-09-16T00:00:00.000Z");
    expect(range.start.toISOString()).toBe("2026-08-17T00:00:00.000Z");
    expect(range.end.getTime() - range.start.getTime()).toBe(30 * DAY_MS);
  });
});

describe("formatUtcRangeLabel", () => {
  it("labels the last INCLUDED day, one day before the exclusive end, and marks UTC", () => {
    const range = resolveAnalyticsRange(
      "7d",
      new Date("2026-09-15T13:45:00.000Z"),
    );

    expect(formatUtcRangeLabel(range)).toBe("09/09 – 15/09 (UTC)");
  });

  it("still marks UTC across a month boundary", () => {
    const range = resolveAnalyticsRange(
      "30d",
      new Date("2026-09-15T13:45:00.000Z"),
    );

    expect(formatUtcRangeLabel(range)).toBe("17/08 – 15/09 (UTC)");
  });
});
