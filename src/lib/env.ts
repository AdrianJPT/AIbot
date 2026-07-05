const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "WEBHOOK_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "APP_ENCRYPTION_KEY",
] as const;

const ENCRYPTION_KEY_LENGTH = 32;

function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}`
    );
  }

  const encryptionKey = Buffer.from(
    process.env.APP_ENCRYPTION_KEY as string,
    "base64"
  );
  if (encryptionKey.length !== ENCRYPTION_KEY_LENGTH) {
    throw new Error(
      `APP_ENCRYPTION_KEY must decode to exactly ${ENCRYPTION_KEY_LENGTH} bytes`
    );
  }
}

validateEnv();
