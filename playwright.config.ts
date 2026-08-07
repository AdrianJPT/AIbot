import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const E2E_DATABASE_URL =
  "postgresql://bot:testpass@localhost:55432/whatsapp_bot?schema=e2e";
const AUTH_STATE = "playwright/.auth/admin.json";
const CLIENT_AUTH_STATE = "playwright/.auth/client.json";
if (
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  throw new Error("Responsive E2E requires Supabase URL and service key");
}
process.env.DATABASE_URL = E2E_DATABASE_URL;
process.env.DIRECT_URL = E2E_DATABASE_URL;

const authenticatedProjects = [
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
    grep: /@mobile/,
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
    grep: /@mobile/,
    dependencies: ["auth-setup"],
  },
  {
    name: "responsive-desktop",
    use: {
      ...devices["Desktop Chrome"],
      storageState: AUTH_STATE,
    },
    testMatch: /responsive\.spec\.ts/,
    grep: /@desktop/,
    dependencies: ["auth-setup"],
  },
  {
    name: "responsive-client-390",
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width: 390, height: 844 },
      storageState: CLIENT_AUTH_STATE,
    },
    testMatch: /responsive\.spec\.ts/,
    grep: /@client/,
    dependencies: ["auth-setup"],
  },
];

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
      grep: /@public/,
    },
    ...authenticatedProjects,
  ],
  webServer: {
    command: "npm run test:db:up && npx prisma migrate deploy && npm run dev",
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
      DATABASE_URL: E2E_DATABASE_URL,
      DIRECT_URL: E2E_DATABASE_URL,
    },
  },
});
