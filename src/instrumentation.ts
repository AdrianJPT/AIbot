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

    const { startReplyWindowScheduler } = await import(
      "./lib/reply-window-scheduler"
    );
    startReplyWindowScheduler();
  }
}
