export const DEFAULT_REPLY_WINDOW_MS = 5_000;
export const MAX_REPLY_WINDOW_MS = 300_000;

/**
 * Clamp a stored reply window to the supported 0-300 second range. The UI
 * enforces the same range, but API callers still need a server-side guard.
 */
export function clampReplyWindowMs(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_REPLY_WINDOW_MS, Math.trunc(n)));
}

/** Convert the form's seconds value to milliseconds without losing explicit 0. */
export function replyWindowMsFromSeconds(value: unknown): number {
  if (value == null || value === "") return DEFAULT_REPLY_WINDOW_MS;
  return clampReplyWindowMs(Number(value) * 1000);
}
