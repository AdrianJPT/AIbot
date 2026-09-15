import type {
  AnalyticsRangeKey,
  DayBucket,
  DeliveryHealth,
  ResponseTimeBucket,
  TokenUsage,
} from "@/lib/analytics/types";

export type { AnalyticsRangeKey };

/** The client-facing shape `GET /api/analytics` returns. */
export type AnalyticsPayload = {
  range: { key: AnalyticsRangeKey; start: string; end: string };
  deliveryHealth: DeliveryHealth;
  volumeByDay: DayBucket[];
  responseTimeByDay: ResponseTimeBucket[];
  tokenUsage: TokenUsage;
};
