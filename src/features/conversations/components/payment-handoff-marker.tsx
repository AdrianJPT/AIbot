import Link from "next/link";
import { CreditCard } from "lucide-react";

/**
 * "Payments" handoff marker (design decision 7, tasks #568 PR4) — surfaces
 * when the AI escalated a PaymentSession to the owner for this conversation.
 * Read-only: unlike HandoffToggle, the owner cannot flip this back from the
 * thread header — escalation clears itself once the owner confirms/rejects
 * the payment from the dashboard or the inline chat card. Kept visually
 * consistent with HandoffToggle's min-h-11 label pattern on purpose.
 */
export function PaymentHandoffMarker() {
  return (
    <Link
      href="/payments"
      className="flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
      title="Hay un pago escalado que requiere atención manual"
    >
      <CreditCard className="h-4 w-4" />
      Pago escalado
    </Link>
  );
}
