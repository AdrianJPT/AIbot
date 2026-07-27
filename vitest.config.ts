import { defineConfig } from "vitest/config";
import path from "node:path";
import { TEST_DATABASE_URL } from "./vitest.global-setup";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // `e2e/**` is Playwright's (`npm run test:e2e`), not Vitest's — the two
    // runners both collect `*.spec.ts`, so it has to be excluded explicitly.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.claude/**",
      "**/e2e/**",
    ],
    // Verifies the test database is up and pushes the schema before any test
    // runs. See docker-compose.test.yml / `npm run test:db:up`.
    globalSetup: "./vitest.global-setup.ts",
    // Route tests hit a shared Postgres. Admin-scoped queries read across
    // every owner, so fixtures created/deleted by a concurrently running
    // test file race with them (Prisma: "Field business is required to
    // return data, got null"). Run test files sequentially.
    fileParallelism: false,
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
    },
  },
});
