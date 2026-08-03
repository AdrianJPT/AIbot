import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

/**
 * The proxy runs Supabase session auth and redirects anonymous requests to
 * /login. Routes that authenticate themselves must be excluded from its
 * matcher, or they answer 307 to callers that hold no Supabase session —
 * which is invisible locally (tests call route handlers directly, and the dev
 * ticker calls runDrain in-process) and only shows up once deployed.
 */
// Next anchors matcher patterns against the full pathname, leading slash
// included — normalizing it away here would silently invert every result.
const matcher = new RegExp(`^${config.matcher[0]}$`);

function isMatched(path: string): boolean {
  return matcher.test(path);
}

describe("proxy matcher", () => {
  it.each([
    ["/api/internal/drain", "authenticates with x-internal-token"],
    ["/api/webhook", "authenticates with Meta's HMAC signature"],
    ["/api/health", "must answer Cloud Run health checks unauthenticated"],
    ["/login", "is the redirect target itself"],
    ["/auth/callback", "completes the Supabase OAuth exchange"],
  ])("excludes %s — %s", (path) => {
    expect(isMatched(path)).toBe(false);
  });

  it.each([["/"], ["/conversations"], ["/api/businesses"]])(
    "still guards %s",
    (path) => {
      expect(isMatched(path)).toBe(true);
    },
  );
});
