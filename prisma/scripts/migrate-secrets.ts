/**
 * One-off backfill: wraps existing plaintext secrets into encrypted
 * Credential rows so they can be managed/rotated from the admin UI
 * (see docs/plan/03-provider-key-management.md). Idempotent — safe to
 * run more than once.
 *
 * What it does:
 * 1. For every Business with an ownerId and a whatsappToken, ensures an
 *    "active" whatsapp Credential exists for that owner wrapping the
 *    token, and links it via Business.whatsappCredentialId. Businesses
 *    without an owner are skipped (nothing to attach the credential to)
 *    and keep working off the legacy whatsappToken column.
 * 2. If OPENAI_API_KEY is set in the environment, creates one "active"
 *    ai Credential (provider "openai") for the owner passed via CLI arg,
 *    unless that owner already has an active ai credential.
 *
 * This script does NOT drop Business.whatsappToken or remove
 * OPENAI_API_KEY from env validation — both legacy fallbacks stay in
 * place until the final cleanup PR of Phase 3 (see the phase doc's PR
 * slicing, PR C item "drop legacy column/env").
 *
 * Usage:
 *   npx tsx prisma/scripts/migrate-secrets.ts --email owner@example.com
 *   npx tsx prisma/scripts/migrate-secrets.ts --user-id <supabase-uuid>
 *
 * The --email/--user-id argument identifies which owner should receive
 * the OPENAI_API_KEY-derived AI credential (skipped if OPENAI_API_KEY is
 * not set, or if no owner is given). WhatsApp token migration runs
 * regardless, scoped to each business's own owner.
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

async function migrateWhatsappTokens(): Promise<void> {
  const businesses = await prisma.business.findMany({
    where: {
      ownerId: { not: null },
      whatsappCredentialId: null,
    },
  });

  let migrated = 0;
  let skipped = 0;

  for (const business of businesses) {
    if (!business.ownerId || !business.whatsappToken) {
      skipped++;
      continue;
    }

    // Idempotency: if the owner already has an active whatsapp
    // credential wrapping this exact token, just link it instead of
    // creating a duplicate.
    const existingActive = await prisma.credential.findFirst({
      where: { ownerId: business.ownerId, kind: "whatsapp", status: "active" },
    });

    const credential =
      existingActive ??
      (await prisma.credential.create({
        data: {
          ownerId: business.ownerId,
          kind: "whatsapp",
          provider: "meta",
          label: `WhatsApp (migrado de ${business.name})`,
          encryptedKey: encryptSecret(business.whatsappToken),
          keyLast4: business.whatsappToken.slice(-4),
          status: "active",
        },
      }));

    await prisma.business.update({
      where: { id: business.id },
      data: { whatsappCredentialId: credential.id },
    });

    migrated++;
  }

  console.log(
    `WhatsApp tokens: linked ${migrated} business(es) to a Credential, skipped ${skipped} (no owner or no token).`
  );
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

  const existingActive = await prisma.credential.findFirst({
    where: { ownerId: user.id, kind: "ai", status: "active" },
  });
  if (existingActive) {
    console.log(
      `${user.email} already has an active AI credential (${existingActive.label}) — skipping.`
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
      status: "active",
    },
  });

  console.log(`Created AI credential for ${user.email} from OPENAI_API_KEY.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  await migrateWhatsappTokens();
  await migrateOpenAiKey(args);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
