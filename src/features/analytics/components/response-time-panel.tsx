import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ResponseTimeBucket } from "@/lib/analytics/types";
import { formatUtcDayShort } from "@/features/analytics/lib/format-day";

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} s`;
  return `${Math.floor(totalSeconds / 60)} min ${totalSeconds % 60} s`;
}

/**
 * Average elapsed time from a customer message to the next outbound reply,
 * per UTC day (spec `Time to Respond`). This is wall-clock elapsed time, so
 * it INCLUDES the configured reply debounce (`Business.replyWindowMs`,
 * which can slide up to 4x while messages keep batching — see
 * `maxBatchAgeMs` in `message-handler.ts`) as well as actual AI generation
 * time; the two are never decomposed here, so the caption below says so
 * explicitly rather than only in this comment (spec: "MUST NOT be presented
 * as AI latency"). A day with no completed reply shows an explicit label
 * instead of a zero-duration bar (never counted as a zero-duration reply).
 */
export function ResponseTimePanel({
  buckets,
}: {
  buckets: ResponseTimeBucket[];
}) {
  const maxMs = Math.max(
    0,
    ...buckets
      .map((bucket) => bucket.avgMs)
      .filter((avgMs): avgMs is number => avgMs !== null),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tiempo hasta responder</CardTitle>
        <CardDescription>
          Incluye el tiempo de espera configurado antes de responder (puede
          extenderse hasta 4 veces ese valor) — no es la latencia de la IA por
          sí sola. Por día (UTC).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul data-testid="response-time-breakdown" className="space-y-2">
          {buckets.map((bucket) => {
            const pct =
              bucket.avgMs === null || maxMs === 0
                ? 0
                : (bucket.avgMs / maxMs) * 100;
            return (
              <li key={bucket.day} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{formatUtcDayShort(bucket.day)}</span>
                  <span className="text-muted-foreground">
                    {bucket.avgMs === null
                      ? "Sin respuestas registradas"
                      : `${formatDuration(bucket.avgMs)} (n=${bucket.sampleCount})`}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
