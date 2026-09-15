"use client";

import { Button } from "@/components/ui/button";
import {
  ANALYTICS_RANGE_KEYS,
  type AnalyticsRangeKey,
} from "@/lib/analytics/types";

const RANGE_LABELS: Record<AnalyticsRangeKey, string> = {
  "7d": "7 días",
  "30d": "30 días",
};

/**
 * The only two selectable ranges (spec `Range Selection`) — never
 * open-ended. Renders straight from `ANALYTICS_RANGE_KEYS`, so a third
 * value can never appear here without also becoming a valid query param.
 */
export function RangeSelector({
  value,
  onChange,
}: {
  value: AnalyticsRangeKey;
  onChange: (key: AnalyticsRangeKey) => void;
}) {
  return (
    <div role="group" aria-label="Rango de fechas" className="flex gap-2">
      {ANALYTICS_RANGE_KEYS.map((key) => (
        <Button
          key={key}
          type="button"
          size="sm"
          variant={value === key ? "default" : "outline"}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {RANGE_LABELS[key]}
        </Button>
      ))}
    </div>
  );
}
