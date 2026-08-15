/**
 * Shared display helpers for the payments feature module — used by both the
 * dashboard inbox (src/features/payments/components/payment-inbox.tsx) and
 * the inline chat card (payment-card.tsx, tasks #568 PR4). Kept in one
 * module so the two entry points never drift on copy/labels/formatting,
 * which matters for the spec's "same state transition occurs as from the
 * dashboard" requirement — the UI should read the same too.
 */

export const VERDICT_LABELS: Record<string, string> = {
  valid: "Válido",
  needs_attention: "Atención",
  suspicious: "Sospechoso",
  invalid: "Inválido",
  duplicate: "Duplicado",
};

export const STATUS_LABELS: Record<string, string> = {
  awaiting_proof: "Esperando comprobante",
  analyzing: "Analizando",
  customer_action: "Esperando al cliente",
  ready_to_confirm: "Listo para confirmar",
  confirmed: "Confirmado",
  rejected: "Rechazado",
  escalated: "Escalado",
  expired: "Expirado",
};

export const ACTOR_LABELS: Record<string, string> = {
  ai: "IA",
  human: "Owner",
  system: "Sistema",
};

export function formatAmount(
  amount: number | null,
  currency: string | null,
): string {
  if (amount === null) return "—";
  const value = (amount / 100).toFixed(2);
  return currency ? `${value} ${currency}` : value;
}
