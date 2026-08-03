import { defineConfig } from "vitest/config";
import path from "node:path";
import { TEST_DATABASE_URL, TEST_WORKER_COUNT } from "./vitest.global-setup";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // `e2e/**` is Playwright's (`npm run test:e2e`), not Vitest's — both
    // runners collect `*.spec.ts`, so it has to be excluded explicitly.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.claude/**",
      "**/e2e/**",
    ],
    // Verifies the test database is up and migrates one schema per worker
    // before any test runs. See docker-compose.test.yml / `npm run test:db:up`.
    globalSetup: "./vitest.global-setup.ts",
    // Repoints each worker at its own schema before any PrismaClient is
    // constructed. This is what makes the parallelism below safe.
    setupFiles: ["./vitest.setup-worker.ts"],
    // Files run in parallel, each against an isolated Postgres schema, so
    // concurrent fixtures are invisible to one another. `maxWorkers` is
    // pinned because globalSetup migrates exactly this many schemas.
    fileParallelism: true,
    maxWorkers: TEST_WORKER_COUNT,
    coverage: {
      provider: "v8",
    },
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      DIRECT_URL: TEST_DATABASE_URL,
      APP_ENCRYPTION_KEY: "s1IiLGg+kAXY1ILiWKmXgF9tM66SYnnmkqFFUBfcnBM=",
      WEBHOOK_VERIFY_TOKEN: "test-verify-token",
      WHATSAPP_APP_SECRET: "test-app-secret",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.test-anon-key",
      SUPABASE_SERVICE_ROLE_KEY:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.test-service-role-key",
      INTERNAL_DRAIN_TOKEN: "test-internal-drain-token",
    },
  },
});
