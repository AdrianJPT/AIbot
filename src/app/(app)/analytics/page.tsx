import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { deliveryHealth, tokenUsage } from "@/lib/analytics/repository";
import {
  DEFAULT_ANALYTICS_RANGE_KEY,
  formatUtcRangeLabel,
  resolveAnalyticsRange,
} from "@/lib/analytics/range";
import { DeliveryHealthPanel } from "@/features/analytics/components/delivery-health-panel";
import { TokenUsagePanel } from "@/features/analytics/components/token-usage-panel";

/**
 * SSR analytics surface, default 30-day range (spec `Range Selection`).
 * Not admin-only — an owner sees their own businesses' numbers, an admin
 * sees the cross-tenant view; both come for free from `deliveryHealth`/
 * `tokenUsage`'s own `messageScope`/`eventLogScope` filtering (spec `Tenant
 * Scoping for Analytics`), never a filter applied here.
 *
 * Only renders the two panels this unit ships. `volumeByDay`/
 * `responseTimeByDay` are deliberately not fetched here yet — nothing
 * consumes them until the volume/response-time panels and the client range
 * selector land in a later unit; that unit will extend this page (and add
 * the client container) rather than fetch data with no current renderer.
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

  const [health, usage] = await Promise.all([
    deliveryHealth(user, range),
    tokenUsage(user, range),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold">Analítica</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {formatUtcRangeLabel(range)}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <DeliveryHealthPanel health={health} />
        <TokenUsagePanel usage={usage} />
      </div>
    </div>
  );
}
