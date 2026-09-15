import { describe, expect, it } from "vitest";
import { fillUtcDayGaps } from "../day-buckets";

describe("fillUtcDayGaps", () => {
  it("fills a UTC day with no matching row as a zero bucket, not omitted", () => {
    // Range covers 3 UTC days: 12th, 13th, 14th. Only the 12th and 14th have
    // rows — the 13th is a gap and must still appear, at zero.
    const range = {
      start: new Date("2026-09-12T00:00:00.000Z"),
      end: new Date("2026-09-15T00:00:00.000Z"),
    };
    const rows = [
      { day: "2026-09-12", inbound: 3, outbound: 1 },
      { day: "2026-09-14", inbound: 2, outbound: 5 },
    ];

    const result = fillUtcDayGaps(rows, range);

    expect(result).toEqual([
      { day: "2026-09-12", inbound: 3, outbound: 1 },
      { day: "2026-09-13", inbound: 0, outbound: 0 },
      { day: "2026-09-14", inbound: 2, outbound: 5 },
    ]);
  });

  it("returns only zero buckets, one per UTC day, when no rows exist at all", () => {
    const range = {
      start: new Date("2026-01-01T00:00:00.000Z"),
      end: new Date("2026-01-03T00:00:00.000Z"),
    };

    const result = fillUtcDayGaps([], range);

    expect(result).toEqual([
      { day: "2026-01-01", inbound: 0, outbound: 0 },
      { day: "2026-01-02", inbound: 0, outbound: 0 },
    ]);
  });
});
