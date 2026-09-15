import {
  SEND_FAILURE_CODES,
  type SendFailureCode,
} from "@/lib/channels/send-failure";

/**
 * Cause-specific copy for a classified outbound send failure (spec
 * `outbound-failure-reasons`'s "Cause-Specific Retry Gating and Copy"
 * requirement). `retryLabel` is what the retry action shows regardless of
 * whether it ends up enabled — `window_expired` relabels it instead of
 * hiding it, so the customer-facing reason stays visible even when the
 * action itself is unavailable.
 */
export type SendFailureCopy = {
  title: string;
  retryLabel: string;
};

const COPY: Record<SendFailureCode, SendFailureCopy> = {
  window_expired: {
    title:
      "No se pudo entregar: pasaron más de 24 horas desde el último mensaje del cliente",
    retryLabel: "Reintento no disponible",
  },
  auth: {
    title: "No se pudo entregar: error de autenticación con WhatsApp",
    retryLabel: "Reintentar",
  },
  rate_limit: {
    title: "No se pudo entregar: se alcanzó el límite de envíos",
    retryLabel: "Reintentar",
  },
  invalid_recipient: {
    title: "No se pudo entregar: número de destino inválido",
    retryLabel: "Reintentar",
  },
  unknown: {
    title: "No se pudo entregar",
    retryLabel: "Reintentar",
  },
};

/** Narrows an arbitrary DB string to a recognized `SendFailureCode`. */
function isKnownFailureCode(code: string): code is SendFailureCode {
  return (SEND_FAILURE_CODES as readonly string[]).includes(code);
}

/**
 * Resolves cause-specific copy for a failure code read straight off the
 * `Message` row. `failureCode` is `String?` in Prisma, not a validated
 * union, so any value the classifier never produced (including a future
 * code this build doesn't know about yet) degrades to the `unknown` copy
 * rather than throwing.
 */
export function sendFailureCopy(
  code: string | null | undefined,
): SendFailureCopy {
  if (code && isKnownFailureCode(code)) {
    return COPY[code];
  }
  return COPY.unknown;
}

/**
 * Pure retry-eligibility gate (design decision "Retry eligibility"):
 * outbound + failed + code !== window_expired. Mirrors the server-side gate
 * in `send/route.ts`'s `retryOf` branch, so the UI never offers a retry the
 * server would reject with 409.
 */
export function canRetryFailedMessage(message: {
  role: string;
  status: string;
  failureCode?: string | null;
}): boolean {
  return (
    message.role === "assistant" &&
    message.status === "failed" &&
    message.failureCode !== "window_expired"
  );
}
