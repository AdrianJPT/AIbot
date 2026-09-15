import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  deliveryHealth,
  responseTimeByDay,
  tokenUsage,
  volumeByDay,
} from "@/lib/analytics/repository";
import {
  DEFAULT_ANALYTICS_RANGE_KEY,
  formatUtcRangeLabel,
  resolveAnalyticsRange,
} from "@/lib/analytics/range";
import { AnalyticsContainer } from "@/features/analytics/containers/analytics-container";
import type { AnalyticsPayload } from "@/features/analytics/types";

/**
 * SSR analytics surface, default 30-day range (spec `Range Selection`).
 * Not admin-only — an owner sees their own businesses' numbers, an admin
 * sees the cross-tenant view; both come for free from each repository
 * function's own `messageScope`/`eventLogScope` filtering (spec `Tenant
 * Scoping for Analytics`), never a filter applied here.
 *
 * Fetches all 4 metrics for the default range and hands them to
 * `AnalyticsContainer` as `initialData`, the same SSR-then-client-refetch
 * shape `settings/events/page.tsx` uses for `EventsPanelContainer`. A later
 * client range change refetches through `GET /api/analytics` — the route
 * already returns this same shape, so it needed no changes for this unit.
 */
export default async function AnalyticsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // This Server Component runs once per request, so reading the clock here
  // is deterministic within that request, not per-render (same reasoning as
  // `src/app/(app)/page.tsx`'s `last24h`, which needs the disable comment
  // because it calls `Date.now()` directly — `new Date()` here doesn't
  // trigger `react-hooks/purity`).
  const range = resolveAnalyticsRange(DEFAULT_ANALYTICS_RANGE_KEY, new Date());

  const [health, volume, responseTime, usage] = await Promise.all([
    deliveryHealth(user, range),
    volumeByDay(user, range),
    responseTimeByDay(user, range),
    tokenUsage(user, range),
  ]);

  const initialPayload: AnalyticsPayload = {
    range: {
      key: DEFAULT_ANALYTICS_RANGE_KEY,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    },
    deliveryHealth: health,
    volumeByDay: volume,
    responseTimeByDay: responseTime,
    tokenUsage: usage,
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">Analítica</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {formatUtcRangeLabel(range)}
      </p>
      <AnalyticsContainer initialPayload={initialPayload} />
    </div>
  );
}
