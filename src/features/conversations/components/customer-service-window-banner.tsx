import type { CustomerServiceWindowState } from "@/features/conversations/lib/customer-service-window";

/**
 * Purely informational — shown only when the customer-service window (CSW)
 * is "outside". Never disables the composer: sending stays possible, the
 * provider (not this UI) is the one that may reject the message.
 */
export function CustomerServiceWindowBanner({
  state,
}: {
  state: CustomerServiceWindowState;
}) {
  if (state !== "outside") return null;

  return (
    <div
      data-testid="customer-service-window-banner"
      className="border-b border-border bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
    >
      Fuera de la ventana de atención de WhatsApp (24h) — el mensaje puede ser
      rechazado.
    </div>
  );
}
