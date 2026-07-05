import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
    },
    env: {
      DATABASE_URL: "postgresql://bot:testpass@localhost:55432/whatsapp_bot",
      DIRECT_URL: "postgresql://bot:testpass@localhost:55432/whatsapp_bot",
      OPENAI_API_KEY: "sk-test-dummy",
      WEBHOOK_VERIFY_TOKEN: "test-verify-token",
      WHATSAPP_APP_SECRET: "test-app-secret",
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.test-anon-key",
      SUPABASE_SERVICE_ROLE_KEY:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.test-service-role-key",
    },
  },
});
