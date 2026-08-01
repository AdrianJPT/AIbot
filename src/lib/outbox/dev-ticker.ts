import { runDrain } from "./drain";
import { logEvent } from "../log";

/**
 * How often local dev drains the outbox and sweeps due conversations.
 * Coarser than any reply-window is ever expected to be configured (seconds,
 * not ms) — this just bounds the extra latency added on top of the
 * configured window, matching the removed setInterval's cadence.
 */
const DEV_DRAIN_INTERVAL_MS = 3000;

let started = false;

/**
 * Local-development replacement for the removed process-level setInterval
 * sweep (src/instrumentation.ts). Without this, `npm run dev` gives a
 * replyWindowMs > 0 business no batched reply at all — and an idle
 * WebhookEvent never gets a retry either — making the feature look broken to
 * anyone touching it locally, since there's no external Cloud Scheduler
 * hitting POST /api/internal/drain outside production.
 *
 * Calls `runDrain()` directly (in-process), not over HTTP — no token, no
 * port assumption, no localhost URL to configure. Guarded by NODE_ENV at the
 * call site in instrumentation.ts, which is what makes this safe: it can
 * never boot in production, the entire point of removing the old
 * setInterval. Must run at most once per process, same guard shape as the
 * scheduler it replaces.
 */
export function startDevDrainTicker(): void {
  if (started) return;
  started = true;

  setInterval(() => {
    runDrain().catch((err) => {
      logEvent("error", "webhook", "Dev drain ticker failed", {
        error: err instanceof Error ? err.message : String(err),
      }).catch(() => undefined);
    });
  }, DEV_DRAIN_INTERVAL_MS);
}
