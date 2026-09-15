import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SEND_FAILURE_CODES } from "@/lib/channels/send-failure";
import type { DeliveryHealth } from "@/lib/analytics/types";
import { failureCodeLabel } from "@/features/analytics/lib/failure-code-copy";

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

/**
 * Delivery-health breakdown (spec `Delivery Health Reporting`): one row per
 * `SendFailureCode`, count AND percentage always rendered as text, never
 * conveyed by color alone. A list, not a pie — every cause stays legible
 * even without color vision or a screen reader that skips styling.
 */
export function DeliveryHealthPanel({ health }: { health: DeliveryHealth }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Salud de entrega</CardTitle>
        <CardDescription>
          {health.totalFailed} de {health.totalOutbound} mensajes salientes
          fallaron ({formatPercent(health.failureRate)})
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul data-testid="delivery-health-breakdown" className="space-y-3">
          {SEND_FAILURE_CODES.map((code) => {
            const count = health.byCode[code];
            const pct =
              health.totalFailed === 0 ? 0 : count / health.totalFailed;
            return (
              <li key={code} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{failureCodeLabel(code)}</span>
                  <span className="text-muted-foreground">
                    {count} ({formatPercent(pct)})
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${pct * 100}%` }}
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
