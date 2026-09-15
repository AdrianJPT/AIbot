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
    // An auth failure is the one cause the operator can actually clear, so
    // the copy names the fix while the action stays available: once the
    // credentials work again, retrying this exact message succeeds. Only
    // window_expired disables retry (spec `outbound-failure-reasons`).
    title: "No se pudo entregar: revisa la conexión con WhatsApp",
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
 *
 * `retried` overrides only `retryLabel` — the title keeps explaining the
 * ORIGINAL cause (the failed bubble stays as history), but the action label
 * flips to "Ya reintentado" once a later row has already delivered the same
 * content successfully (retry-duplicate-and-visible-cause defect 1).
 */
export function sendFailureCopy(
  code: string | null | undefined,
  retried = false,
): SendFailureCopy {
  const base = code && isKnownFailureCode(code) ? COPY[code] : COPY.unknown;
  return retried ? { title: base.title, retryLabel: "Ya reintentado" } : base;
}

/**
 * Pure retry-eligibility gate (design decision "Retry eligibility"):
 * outbound + failed + code !== window_expired + not already retried.
 * Mirrors the server-side gate in `send/route.ts`'s `retryOf` branch, so the
 * UI never offers a retry the server would reject with 409.
 */
export function canRetryFailedMessage(message: {
  role: string;
  status: string;
  failureCode?: string | null;
  retried?: boolean;
}): boolean {
  return (
    message.role === "assistant" &&
    message.status === "failed" &&
    message.failureCode !== "window_expired" &&
    !message.retried
  );
}
