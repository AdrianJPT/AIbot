import type { AnalyticsRange } from "./types";

/**
 * Fills every UTC calendar day in `[range.start, range.end)` that has no
 * matching row in `rows` with a caller-supplied empty bucket, so a day with
 * no data renders as an explicit zero/null value rather than being silently
 * omitted (spec `Volume Over Time`, "Gap day renders as zero"; also used by
 * `responseTimeByDay`'s day-with-no-completed-reply case — design's "UTC Day
 * Bucketing" decision names both shapes for this one helper). Pure — no DB
 * access — so gap-fill logic is unit-testable independently of
 * `repository.ts`'s SQL.
 *
 * Generic over the row shape (`DayBucket` for volume, `ResponseTimeBucket`
 * for response time) so both callers share one walk-every-day loop instead
 * of duplicating it. `emptyDay(day)` builds the caller's own zero-value
 * shape for a missing day.
 *
 * `rows` must already be deduplicated by `day` (repository.ts's `GROUP BY
 * day` guarantees this for both callers); a duplicate `day` here would
 * silently shadow an earlier one.
 */
export function fillUtcDayGaps<T extends { day: string }>(
  rows: T[],
  range: AnalyticsRange,
  emptyDay: (day: string) => T,
): T[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const result: T[] = [];

  const cursor = new Date(
    Date.UTC(
      range.start.getUTCFullYear(),
      range.start.getUTCMonth(),
      range.start.getUTCDate(),
    ),
  );

  while (cursor < range.end) {
    const day = cursor.toISOString().slice(0, 10);
    result.push(byDay.get(day) ?? emptyDay(day));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return result;
}
