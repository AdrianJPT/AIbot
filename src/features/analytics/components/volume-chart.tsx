import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DayBucket } from "@/lib/analytics/types";
import { formatUtcDayShort } from "@/features/analytics/lib/format-day";

const BAR_WIDTH = 10;
const BAR_GAP = 4;
const CHART_HEIGHT = 80;
const MIN_BAR_HEIGHT = 2;
const SLOT_WIDTH = BAR_WIDTH * 2 + BAR_GAP * 3;

function scaledHeight(count: number, max: number): number {
  if (max === 0) return MIN_BAR_HEIGHT;
  return Math.max(MIN_BAR_HEIGHT, (count / max) * CHART_HEIGHT);
}

/**
 * Inbound/outbound message volume per UTC day (spec `Volume Over Time`). A
 * zero-traffic day still renders its own bar pair and hidden-table row —
 * never skipped (spec "Gap day renders as zero"). Inbound (solid fill) and
 * outbound (dashed outline) are distinguished by shape, not color alone;
 * every value is also restated as text in the `sr-only` table so the SVG is
 * never the only way to read a count.
 */
export function VolumeChart({ buckets }: { buckets: DayBucket[] }) {
  const maxCount = Math.max(
    0,
    ...buckets.flatMap((bucket) => [bucket.inbound, bucket.outbound]),
  );
  const width = buckets.length * SLOT_WIDTH;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Volumen de mensajes</CardTitle>
        <CardDescription>Entrantes vs. salientes por día (UTC)</CardDescription>
      </CardHeader>
      <CardContent>
        <svg
          role="img"
          aria-label="Volumen de mensajes por día, entrantes vs. salientes"
          width={width}
          height={CHART_HEIGHT + BAR_GAP}
        >
          {buckets.map((bucket, index) => {
            const x = index * SLOT_WIDTH + BAR_GAP;
            const inboundHeight = scaledHeight(bucket.inbound, maxCount);
            const outboundHeight = scaledHeight(bucket.outbound, maxCount);
            return (
              <g key={bucket.day}>
                <title>
                  {formatUtcDayShort(bucket.day)}: {bucket.inbound} entrantes,{" "}
                  {bucket.outbound} salientes
                </title>
                <rect
                  x={x}
                  y={CHART_HEIGHT - inboundHeight}
                  width={BAR_WIDTH}
                  height={inboundHeight}
                  fill="currentColor"
                  className="text-primary"
                />
                <rect
                  x={x + BAR_WIDTH + BAR_GAP}
                  y={CHART_HEIGHT - outboundHeight}
                  width={BAR_WIDTH}
                  height={outboundHeight}
                  fill="none"
                  stroke="currentColor"
                  strokeDasharray="2,2"
                  className="text-muted-foreground"
                />
              </g>
            );
          })}
        </svg>
        <table className="sr-only">
          <caption>Volumen de mensajes por día (UTC)</caption>
          <thead>
            <tr>
              <th>Día (UTC)</th>
              <th>Entrantes</th>
              <th>Salientes</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={bucket.day}>
                <td>{bucket.day}</td>
                <td>{bucket.inbound}</td>
                <td>{bucket.outbound}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
