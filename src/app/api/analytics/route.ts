import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  deliveryHealth,
  responseTimeByDay,
  tokenUsage,
  volumeByDay,
} from "@/lib/analytics/repository";
import {
  DEFAULT_ANALYTICS_RANGE_KEY,
  isAnalyticsRangeKey,
  resolveAnalyticsRange,
} from "@/lib/analytics/range";

/**
 * On-demand operational-analytics payload for the selected range (spec
 * `Range Selection`). `range` accepts only `7d`/`30d` — any other value is
 * rejected with 400 rather than silently clamped, so the surface can never
 * drift into an open-ended query. Every metric comes from
 * `repository.ts`, which derives its own tenant filter from `user` via
 * `messageScope`/`eventLogScope` — this route never applies its own
 * filter, so it can't drift from the rest of the app's ownership rules
 * (design's "Admin vs Owner" section, spec `Tenant Scoping for
 * Analytics`).
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const rangeParam = req.nextUrl.searchParams.get("range");
  if (rangeParam !== null && !isAnalyticsRangeKey(rangeParam)) {
    return NextResponse.json({ error: "Rango inválido" }, { status: 400 });
  }
  const rangeKey = rangeParam ?? DEFAULT_ANALYTICS_RANGE_KEY;
  const range = resolveAnalyticsRange(rangeKey, new Date());

  const [health, volume, responseTime, usage] = await Promise.all([
    deliveryHealth(user, range),
    volumeByDay(user, range),
    responseTimeByDay(user, range),
    tokenUsage(user, range),
  ]);

  return NextResponse.json({
    range: {
      key: rangeKey,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    },
    deliveryHealth: health,
    volumeByDay: volume,
    responseTimeByDay: responseTime,
    tokenUsage: usage,
  });
}
