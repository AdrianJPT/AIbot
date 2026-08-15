import { ACTOR_LABELS } from "@/features/payments/lib/format";
import type { PaymentAuditEntryItem } from "@/features/payments/types";

/**
 * Full PaymentAuditEntry trail (spec's "Auditability" requirement) — shared
 * between the dashboard detail sheet and the inline chat card (tasks #568
 * PR4, task 3), both via PaymentCard/PaymentCardContainer.
 */
export function PaymentAuditTrail({
  entries,
}: {
  entries: PaymentAuditEntryItem[];
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin eventos registrados todavía.
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="rounded border border-border p-2 text-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">
              {ACTOR_LABELS[entry.actor] ?? entry.actor}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(entry.createdAt).toLocaleString("es-MX")}
            </span>
          </div>
          <div className="break-words text-muted-foreground">
            {entry.action}
          </div>
        </li>
      ))}
    </ol>
  );
}
