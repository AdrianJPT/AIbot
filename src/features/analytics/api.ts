import type {
  AnalyticsPayload,
  AnalyticsRangeKey,
} from "@/features/analytics/types";
import { requestJson } from "@/lib/api-client";

/**
 * Client-side fetch for `GET /api/analytics`. Not yet consumed — the range
 * selector/container that will call this on a range change lands in a
 * later unit; this is scaffolding for that unit, mirroring
 * `src/features/events/api.ts`.
 */
export function fetchAnalytics(
  range: AnalyticsRangeKey,
): Promise<AnalyticsPayload> {
  const params = new URLSearchParams({ range });
  return requestJson<AnalyticsPayload>(`/api/analytics?${params}`);
}
