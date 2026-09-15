import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { TokenUsage } from "@/lib/analytics/types";

function formatCount(value: number): string {
  return value.toLocaleString("es-MX");
}

/**
 * AI token usage totals (spec/proposal: "no dollar figure"). This repo has
 * no pricing table anywhere, so inventing a cost estimate here would be a
 * silent accuracy claim nothing backs — only raw prompt/completion/total
 * counts are shown.
 */
export function TokenUsagePanel({ usage }: { usage: TokenUsage }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Uso de tokens de IA</CardTitle>
        <CardDescription>
          {usage.sampleCount} respuestas con uso registrado
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Prompt</dt>
            <dd className="text-lg font-semibold">
              {formatCount(usage.promptTokens)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Respuesta</dt>
            <dd className="text-lg font-semibold">
              {formatCount(usage.completionTokens)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="text-lg font-semibold">
              {formatCount(usage.totalTokens)}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
