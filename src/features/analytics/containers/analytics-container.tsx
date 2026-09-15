"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAnalytics } from "@/features/analytics/api";
import { DEFAULT_ANALYTICS_RANGE_KEY } from "@/lib/analytics/range";
import type {
  AnalyticsPayload,
  AnalyticsRangeKey,
} from "@/features/analytics/types";
import { RangeSelector } from "@/features/analytics/components/range-selector";
import { DeliveryHealthPanel } from "@/features/analytics/components/delivery-health-panel";
import { TokenUsagePanel } from "@/features/analytics/components/token-usage-panel";
import { VolumeChart } from "@/features/analytics/components/volume-chart";
import { ResponseTimePanel } from "@/features/analytics/components/response-time-panel";

/**
 * Client range switch for the analytics surface (design's Data Flow:
 * `AnalyticsContainer` swaps in on the client after the SSR default-range
 * payload). `initialData` seeds only the default range's exact SSR
 * snapshot — the same reuse-only-when-matching shape as
 * `EventsPanelContainer`'s `Object.keys(filters).length === 0` check — so
 * switching away from and back to the default range refetches instead of
 * replaying a possibly stale snapshot. No container test: this repo has no
 * existing container test file to follow, and the one conditional here
 * mirrors that already-untested precedent rather than adding new branchy
 * logic of its own.
 */
export function AnalyticsContainer({
  initialPayload,
}: {
  initialPayload: AnalyticsPayload;
}) {
  const [range, setRange] = useState<AnalyticsRangeKey>(
    DEFAULT_ANALYTICS_RANGE_KEY,
  );

  const { data, isFetching } = useQuery({
    queryKey: ["analytics", range],
    queryFn: () => fetchAnalytics(range),
    ...(range === DEFAULT_ANALYTICS_RANGE_KEY && {
      initialData: initialPayload,
    }),
  });

  const payload = data ?? initialPayload;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <RangeSelector value={range} onChange={setRange} />
        {isFetching && (
          <span className="text-sm text-muted-foreground">Actualizando…</span>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <DeliveryHealthPanel health={payload.deliveryHealth} />
        <TokenUsagePanel usage={payload.tokenUsage} />
        <VolumeChart buckets={payload.volumeByDay} />
        <ResponseTimePanel buckets={payload.responseTimeByDay} />
      </div>
    </div>
  );
}
