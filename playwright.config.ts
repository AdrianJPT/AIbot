import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const AUTH_STATE = "playwright/.auth/admin.json";
const hasAuthenticatedUser = Boolean(
  process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD,
);

if (process.env.CI && !hasAuthenticatedUser) {
  throw new Error(
    "CI responsive tests require E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD",
  );
}

const authenticatedProjects = hasAuthenticatedUser
  ? [
      {
        name: "auth-setup",
        testMatch: /auth\.setup\.ts/,
      },
      {
        name: "responsive-320",
        use: {
          ...devices["Desktop Chrome"],
          viewport: { width: 320, height: 568 },
          storageState: AUTH_STATE,
        },
        testMatch: /responsive\.spec\.ts/,
        dependencies: ["auth-setup"],
      },
      {
        name: "responsive-390",
        use: {
          ...devices["Desktop Chrome"],
          viewport: { width: 390, height: 844 },
          storageState: AUTH_STATE,
        },
        testMatch: /responsive\.spec\.ts/,
        dependencies: ["auth-setup"],
      },
      {
        name: "responsive-desktop",
        use: {
          ...devices["Desktop Chrome"],
          storageState: AUTH_STATE,
        },
        testMatch: /responsive\.spec\.ts/,
        dependencies: ["auth-setup"],
      },
    ]
  : [];

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
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /auth\.setup\.ts/,
    },
    ...authenticatedProjects,
  ],
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
