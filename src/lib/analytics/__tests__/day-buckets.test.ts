import { describe, expect, it } from "vitest";
import { fillUtcDayGaps } from "../day-buckets";

const emptyVolumeDay = (day: string) => ({ day, inbound: 0, outbound: 0 });

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

    const result = fillUtcDayGaps(rows, range, emptyVolumeDay);

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

    const result = fillUtcDayGaps([], range, emptyVolumeDay);

    expect(result).toEqual([
      { day: "2026-01-01", inbound: 0, outbound: 0 },
      { day: "2026-01-02", inbound: 0, outbound: 0 },
    ]);
  });

  it("fills a UTC day with no matching row using a different empty shape (response-time buckets)", () => {
    // Triangulation: the generic helper must work for a shape with
    // different fields/defaults than the volume bucket above, matching
    // ResponseTimeBucket's { day, avgMs: null, sampleCount: 0 } contract.
    const range = {
      start: new Date("2026-09-12T00:00:00.000Z"),
      end: new Date("2026-09-14T00:00:00.000Z"),
    };
    const rows: { day: string; avgMs: number | null; sampleCount: number }[] = [
      { day: "2026-09-12", avgMs: 4500, sampleCount: 3 },
    ];

    const result = fillUtcDayGaps(rows, range, (day) => ({
      day,
      avgMs: null,
      sampleCount: 0,
    }));

    expect(result).toEqual([
      { day: "2026-09-12", avgMs: 4500, sampleCount: 3 },
      { day: "2026-09-13", avgMs: null, sampleCount: 0 },
    ]);
  });
});
