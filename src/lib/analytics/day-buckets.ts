import type { AnalyticsRange, DayBucket } from "./types";

/**
 * Fills every UTC calendar day in `[range.start, range.end)` that has no
 * matching row in `rows` with a zero bucket, so a day with no traffic
 * renders as zero rather than being silently omitted (spec `Volume Over
 * Time`, "Gap day renders as zero"). Pure — no DB access — so gap-fill
 * logic is unit-testable independently of `repository.ts`'s SQL (design's
 * "UTC Day Bucketing" decision).
 *
 * `rows` must already be deduplicated by `day` (repository.ts's
 * `volumeByDay` GROUP BY guarantees this); a duplicate `day` here would
 * silently shadow an earlier one.
 */
export function fillUtcDayGaps(
  rows: DayBucket[],
  range: AnalyticsRange,
): DayBucket[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const result: DayBucket[] = [];

  const cursor = new Date(
    Date.UTC(
      range.start.getUTCFullYear(),
      range.start.getUTCMonth(),
      range.start.getUTCDate(),
    ),
  );

  while (cursor < range.end) {
    const day = cursor.toISOString().slice(0, 10);
    result.push(byDay.get(day) ?? { day, inbound: 0, outbound: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return result;
}
