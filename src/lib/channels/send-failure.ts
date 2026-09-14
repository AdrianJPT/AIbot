/**
 * Channel-neutral outbound send-failure types and classification helpers
 * (design's "Interfaces" section, spec `outbound-failure-reasons`). Every
 * provider-specific mapping (e.g. Meta error codes) stays in that channel's
 * own module — see `whatsapp-send-failure.ts`. This module never imports
 * `axios` or any provider SDK, so it is safe to import from client
 * components (`sendFailureCopy` in a later unit reuses `SendFailureCode`).
 */

/** Every classified reason an outbound delivery can fail. */
export const SEND_FAILURE_CODES = [
  "window_expired",
  "auth",
  "rate_limit",
  "invalid_recipient",
  "unknown",
] as const;

export type SendFailureCode = (typeof SEND_FAILURE_CODES)[number];

/** A classified failure: a stable code plus optional sanitized provider detail. */
export type SendFailure = {
  code: SendFailureCode;
  detail: string | null;
};

/**
 * Thrown by a channel adapter's send path once a provider error has been
 * classified. `message` keeps the caller-facing error contract (e.g.
 * `whatsapp.ts`'s `WhatsApp send failed:` prefix); `failure` is the
 * channel-neutral classification the domain layer consumes via
 * `sendFailureFromError`.
 */
export class ChannelSendError extends Error {
  readonly failure: SendFailure;

  constructor(
    message: string,
    failure: SendFailure,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ChannelSendError";
    this.failure = failure;
  }
}

/** Matches 7 or more consecutive digits — phone numbers, ids, trace numbers. */
const DIGIT_RUN_PATTERN = /\d{7,}/g;

/** Matches a Bearer token, including the scheme, so no partial token leaks. */
const BEARER_TOKEN_PATTERN = /Bearer\s+\S+/gi;

/** Matches an `access_token=<value>` query-param style credential. */
const ACCESS_TOKEN_PATTERN = /access_token=\S+/gi;

const MAX_DETAIL_LENGTH = 300;

/**
 * Sanitizes free-text provider detail before it is ever persisted or
 * displayed: redacts digit runs (phone numbers, ids) and bearer/access
 * tokens, collapses whitespace, and truncates to a bounded length. Callers
 * MUST build the input from provider error code/title/details fields only —
 * never from axios request config, headers, URLs, or bodies (design's
 * "Detail storage" decision).
 */
export function sanitizeFailureDetail(
  text: string | null | undefined,
): string | null {
  if (text === null || text === undefined) {
    return null;
  }

  const redacted = text
    .replace(BEARER_TOKEN_PATTERN, "[redacted]")
    .replace(ACCESS_TOKEN_PATTERN, "[redacted]")
    .replace(DIGIT_RUN_PATTERN, "[redacted]");

  const collapsed = redacted.replace(/\s+/g, " ").trim();

  if (collapsed.length <= MAX_DETAIL_LENGTH) {
    return collapsed;
  }
  return `${collapsed.slice(0, MAX_DETAIL_LENGTH)}…`;
}

/**
 * Resolves the channel-neutral `SendFailure` for any thrown value. A
 * `ChannelSendError` already carries its classification, so it passes
 * through unchanged. Any other thrown value (a foreign error, a plain
 * string, network/timeout errors that never reached a channel adapter's
 * classifier) degrades to `unknown` with a best-effort sanitized detail.
 */
export function sendFailureFromError(err: unknown): SendFailure {
  if (err instanceof ChannelSendError) {
    return err.failure;
  }

  if (err instanceof Error) {
    return { code: "unknown", detail: sanitizeFailureDetail(err.message) };
  }

  return { code: "unknown", detail: null };
}
