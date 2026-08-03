import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "list" : "html",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    // Poll the public healthcheck rather than `/`: every other route is
    // behind the auth proxy, so readiness would be indistinguishable
    // from a redirect loop.
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Everything `src/lib/env.ts` marks required that a developer's local
      // `.env` may not carry. The suite decides which origin it drives, and
      // the drain token is only ever used by the app talking to itself, so
      // both are pinned here rather than depending on local setup.
      NEXT_PUBLIC_SITE_URL: BASE_URL,
      INTERNAL_DRAIN_TOKEN: "test-internal-drain-token",
    },
  },
});
