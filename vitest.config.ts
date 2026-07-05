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
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      DIRECT_URL: "postgresql://test:test@localhost:5432/test",
      OPENAI_API_KEY: "sk-test-dummy",
      WEBHOOK_VERIFY_TOKEN: "test-verify-token",
      WHATSAPP_APP_SECRET: "test-app-secret",
    },
  },
});
