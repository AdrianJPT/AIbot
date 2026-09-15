import type { SendFailureCode } from "@/lib/channels/send-failure";

/**
 * Short, operator-facing Spanish labels for the delivery-health breakdown
 * (spec `Delivery Health Reporting`) — never the raw `failureCode` string.
 *
 * Deliberately NOT reused from
 * `src/features/conversations/lib/send-failure-copy.ts`: that module's
 * copy is customer-thread-scoped (a full sentence prefixed "No se pudo
 * entregar: ...", plus a `retryLabel` for one message's retry action) — the
 * wrong shape for a per-cause count/percentage row in an aggregate report.
 * Importing a `conversations` feature module from `analytics` would also be
 * a new cross-feature-lib boundary this repo doesn't otherwise cross (the
 * one existing cross-feature import, `admin` -> `features/businesses/types`,
 * is type-only, not a lib/behavior import). This mapping stays local to
 * `analytics`, parallel to how `conversations` owns its own copy.
 */
const FAILURE_CODE_LABEL: Record<SendFailureCode, string> = {
  window_expired: "Ventana de 24 horas vencida",
  auth: "Error de autenticación con WhatsApp",
  rate_limit: "Límite de envíos alcanzado",
  invalid_recipient: "Número de destino inválido",
  unknown: "Causa desconocida",
};

export function failureCodeLabel(code: SendFailureCode): string {
  return FAILURE_CODE_LABEL[code];
}
