/**
 * WhatsApp (Meta Cloud API) provider-specific error classification. All
 * Meta error-code knowledge stays isolated here — the channel-neutral
 * `send-failure.ts` module and the domain layer never see a raw Meta code
 * (design's "Technical Approach": "Meta error knowledge stays in the
 * WhatsApp layer").
 *
 * Sources (live-verified, see design's "Evidence" section):
 *   https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 *   https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 *   https://developers.facebook.com/docs/graph-api/guides/error-handling
 *
 * Two shapes carry the same fields under different envelopes:
 *   - sync (HTTP 4xx from `sendMessage`'s POST): `response.data.error`
 *   - async (a delivery-status webhook): an item from `statuses[].errors[]`
 * Both expose `code` and `error_data.details`; only the async shape also
 * carries `title`. `classifyMetaError` accepts either envelope, or the bare
 * error object itself, and normalizes internally.
 */

import type { SendFailure, SendFailureCode } from "./send-failure";
import { sanitizeFailureDetail } from "./send-failure";

/** The fields Meta's sync and async error shapes have in common. */
type MetaErrorFields = {
  code?: number;
  title?: string;
  message?: string;
  error_data?: { details?: string };
};

/** Meta codes that mean the 24h customer-service window has expired. */
const WINDOW_EXPIRED_CODES = new Set([131047]);

/**
 * Permission/auth-class codes. 3, 10, and every code in 200-299 are
 * permission-class rather than token-class, and 131005 is a missing local
 * credential — the design accepts bucketing all of these under `auth`
 * because they share the same operator action (fix app permissions or
 * credentials).
 */
function isAuthCode(code: number): boolean {
  return (
    code === 0 ||
    code === 3 ||
    code === 10 ||
    code === 190 ||
    code === 131005 ||
    (code >= 200 && code <= 299)
  );
}

/** Rate-limit and quality/spam-restriction codes bucketed under `rate_limit` (same UX: wait, retry later). */
const RATE_LIMIT_CODES = new Set([4, 80007, 130429, 131048, 131056]);

const INVALID_RECIPIENT_CODES = new Set([131026, 131030, 131021]);

function mapCodeToFailureCode(code: number | undefined): SendFailureCode {
  if (code === undefined) {
    return "unknown";
  }
  if (WINDOW_EXPIRED_CODES.has(code)) {
    return "window_expired";
  }
  if (isAuthCode(code)) {
    return "auth";
  }
  if (RATE_LIMIT_CODES.has(code)) {
    return "rate_limit";
  }
  if (INVALID_RECIPIENT_CODES.has(code)) {
    return "invalid_recipient";
  }
  return "unknown";
}

/**
 * Normalizes either envelope shape (sync `{error: {...}}` or an async
 * `errors[]` item passed directly) into the fields the classifier needs.
 * Returns `null` for anything that isn't a recognizable Meta error body —
 * a missing body (network/timeout error), an empty object, or a body with
 * neither an `error` property nor a `code` of its own.
 */
function extractMetaError(body: unknown): MetaErrorFields | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const record = body as Record<string, unknown>;

  if (record.error && typeof record.error === "object") {
    return record.error as MetaErrorFields;
  }

  if ("code" in record) {
    return record as MetaErrorFields;
  }

  return null;
}

/** Builds the sanitized detail text strictly from code/title/details — never from transport data. */
function buildDetail(fields: MetaErrorFields): string | null {
  const headline = [fields.code, fields.title ?? fields.message]
    .filter((part) => part !== undefined && part !== null && part !== "")
    .join(" ");
  const details = fields.error_data?.details;

  const raw = details ? `${headline}: ${details}` : headline;
  return sanitizeFailureDetail(raw || null);
}

/**
 * Classifies a Meta Cloud API error into a channel-neutral `SendFailure`.
 * `body` is the raw provider error data, in either the sync or async
 * envelope shape (or `undefined`/malformed for a network or timeout
 * failure, which always classifies as `unknown`).
 */
export function classifyMetaError(body: unknown): SendFailure {
  const fields = extractMetaError(body);
  if (!fields) {
    return { code: "unknown", detail: null };
  }

  return {
    code: mapCodeToFailureCode(fields.code),
    detail: buildDetail(fields),
  };
}
