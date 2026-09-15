import {
  ANALYTICS_RANGE_KEYS,
  type AnalyticsRange,
  type AnalyticsRangeKey,
} from "./types";

const RANGE_DAYS: Record<AnalyticsRangeKey, number> = { "7d": 7, "30d": 30 };

/** Default range when none is selected (spec `Range Selection`: 30 days). */
export const DEFAULT_ANALYTICS_RANGE_KEY: AnalyticsRangeKey = "30d";

/**
 * True only for the two selectable range keys — never open-ended (spec
 * `Range Selection`). Callers (the API route, later the range selector)
 * MUST reject anything else instead of silently defaulting it.
 */
export function isAnalyticsRangeKey(value: string): value is AnalyticsRangeKey {
  return (ANALYTICS_RANGE_KEYS as readonly string[]).includes(value);
}

function utcMidnight(now: Date, offsetDays: number): Date {
  const todayMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return new Date(todayMidnight + offsetDays * 24 * 60 * 60 * 1000);
}

/**
 * Resolves a validated range key to a bounded `[start, end)` UTC range of
 * exactly N whole calendar days, ending at tomorrow's UTC midnight so
 * "today" is included — the same convention as
 * `src/lib/analytics/__tests__/repository.test.ts`'s `testRange` helper.
 * `now` is a required argument, never defaulted to `new Date()` internally,
 * so this stays a pure, directly unit-testable function; callers pass the
 * request-time clock reading explicitly.
 */
export function resolveAnalyticsRange(
  key: AnalyticsRangeKey,
  now: Date,
): AnalyticsRange {
  const days = RANGE_DAYS[key];
  return { start: utcMidnight(now, 1 - days), end: utcMidnight(now, 1) };
}

function formatUtcDayLabel(date: Date): string {
  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * Human-readable UTC range caption, e.g. "09/09 – 15/09 (UTC)" (spec `Range
 * Selection`: "surface MUST label day boundaries as UTC"). `range.end` is
 * exclusive (tomorrow's UTC midnight), so the label's second date is the
 * last INCLUDED day — one day before `end`, not `end` itself.
 */
export function formatUtcRangeLabel(range: AnalyticsRange): string {
  const lastIncludedDay = new Date(range.end.getTime() - 24 * 60 * 60 * 1000);
  return `${formatUtcDayLabel(range.start)} – ${formatUtcDayLabel(lastIncludedDay)} (UTC)`;
}
