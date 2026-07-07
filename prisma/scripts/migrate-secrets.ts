/**
 * One-off backfill: wraps OPENAI_API_KEY (if set) into an encrypted AI
 * Credential so it can be managed/rotated from the admin UI (see
 * docs/plan/03-provider-key-management.md). Idempotent — safe to run more
 * than once.
 *
 * The legacy WhatsApp-token migration this script used to perform
 * (Business.whatsappToken -> Credential) has been superseded by
 * prisma/scripts/migrate-phone-numbers.ts, which also introduces the
 * PhoneNumber model (see docs/plan/07-waba-phone-numbers.md).
 *
 * Usage:
 *   npx tsx prisma/scripts/migrate-secrets.ts --email owner@example.com
 *   npx tsx prisma/scripts/migrate-secrets.ts --user-id <supabase-uuid>
 */
import { PrismaClient } from "@prisma/client";
import { encryptSecret } from "../../src/lib/crypto";

const prisma = new PrismaClient();

function parseArgs(argv: string[]): { email?: string; userId?: string } {
  const result: { email?: string; userId?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--email") result.email = argv[++i];
    if (argv[i] === "--user-id") result.userId = argv[++i];
  }
  return result;
}

async function migrateOpenAiKey(ownerIdOrEmail: {
  email?: string;
  userId?: string;
}): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("OPENAI_API_KEY not set — skipping AI credential migration.");
    return;
  }

  if (!ownerIdOrEmail.email && !ownerIdOrEmail.userId) {
    console.log(
      "OPENAI_API_KEY is set but no --email/--user-id was given — skipping AI credential migration."
    );
    return;
  }

  const user = ownerIdOrEmail.userId
    ? await prisma.user.findUnique({ where: { id: ownerIdOrEmail.userId } })
    : await prisma.user.findUnique({ where: { email: ownerIdOrEmail.email! } });

  if (!user) {
    console.error(
      `No User found for ${ownerIdOrEmail.userId ? `id=${ownerIdOrEmail.userId}` : `email=${ownerIdOrEmail.email}`}. Skipping AI credential migration.`
    );
    return;
  }

  const existingCredential = await prisma.credential.findFirst({
    where: { ownerId: user.id, kind: "ai" },
  });
  if (existingCredential) {
    console.log(
      `${user.email} already has an AI credential (${existingCredential.label}) — skipping.`
    );
    return;
  }

  await prisma.credential.create({
    data: {
      ownerId: user.id,
      kind: "ai",
      provider: "openai",
      label: "OpenAI (migrado de OPENAI_API_KEY)",
      encryptedKey: encryptSecret(apiKey),
      keyLast4: apiKey.slice(-4),
    },
  });

  console.log(`Created AI credential for ${user.email} from OPENAI_API_KEY.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  await migrateOpenAiKey(args);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
