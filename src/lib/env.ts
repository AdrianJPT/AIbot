const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "OPENAI_API_KEY",
  "WEBHOOK_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}`
    );
  }
}

validateEnv();
