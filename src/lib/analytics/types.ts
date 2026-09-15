import type { SendFailureCode } from "@/lib/channels/send-failure";

/**
 * A bounded, half-open UTC range: `[start, end)`. Every analytics query in
 * this module takes one of these instead of an open-ended filter, so every
 * query stays index-served on date columns (spec `Range Selection`).
 */
export type AnalyticsRange = { start: Date; end: Date };

/**
 * Outbound delivery health for a range (spec `Delivery Health Reporting`).
 * `byCode` always carries all five `SendFailureCode` keys, zero-filled —
 * never a sparse object missing an unobserved cause.
 *
 * Design's Interfaces section also proposes `retried`/`retryRate` fields
 * (decision "Retry rate definition"). They are deliberately omitted here:
 * no spec scenario, tasks.md Unit 2 item, or later unit's tested UI
 * scenario (Unit 5's `DeliveryHealthPanel`) requires them, so there is no
 * failing test to drive that behavior under strict TDD. Add them in a
 * later unit, with their own RED test, if a concrete scenario needs them.
 */
export type DeliveryHealth = {
  byCode: Record<SendFailureCode, number>;
  totalOutbound: number;
  totalFailed: number;
  failureRate: number;
};

/**
 * Average time-to-respond for one UTC calendar day (spec `Time to
 * Respond`). `avgMs` is `null` and `sampleCount` is 0 for a day with no
 * completed reply — never a synthetic zero-duration average.
 */
export type ResponseTimeBucket = {
  day: string;
  avgMs: number | null;
  sampleCount: number;
};

/** AI token usage totals for a range, summed from `EventLog` "ai-usage" detail. */
export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  sampleCount: number;
};
