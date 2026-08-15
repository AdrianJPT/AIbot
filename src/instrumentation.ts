/**
 * Runs once when the server process boots (not during `next build`), so
 * required env vars are validated before the app starts serving traffic
 * instead of failing lazily on first use (e.g. a bad WHATSAPP_APP_SECRET
 * silently rejecting every webhook, or APP_ENCRYPTION_KEY crashing decrypt
 * calls hours after deploy).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/env");

    // Production/Cloud Run never boots a scheduler here — dispatch runs only
    // through the authenticated POST /api/internal/drain endpoint, invoked
    // externally (Cloud Scheduler/cron). A per-process setInterval here
    // would send at most one reply per instance and none on a scaled-to-zero
    // one, which is strictly worse than not shipping the outbox at all — see
    // design §6. Local dev has no external scheduler, so it gets its own
    // in-process ticker instead, guarded by NODE_ENV so it can never boot in
    // production.
    if (process.env.NODE_ENV !== "production") {
      const { startDevDrainTicker } = await import("./lib/outbox/dev-ticker");
      startDevDrainTicker();
    }
  }
}
