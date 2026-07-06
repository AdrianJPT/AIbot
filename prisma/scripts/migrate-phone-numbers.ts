/**
 * One-off backfill: creates one PhoneNumber row per existing Business,
 * copying phoneNumberId/displayPhone/whatsappCredentialId/isActive off the
 * legacy Business columns, then points every Conversation at that number
 * (see docs/plan/07-waba-phone-numbers.md §2). Idempotent — safe to run
 * more than once; skips any Business that already has a PhoneNumber row.
 *
 * Run order (prod): expand migration -> this script -> contract migration.
 * Reads the legacy Business columns via raw SQL rather than the typed
 * Prisma Client, since by the time this repo's schema.prisma ships (the
 * "contract" state), those columns no longer exist in the generated
 * client's types — even though they're still physically present in the
 * database in the window between the expand and contract migrations.
 *
 * Usage:
 *   npx tsx prisma/scripts/migrate-phone-numbers.ts
 */
import { PrismaClient } from "@prisma/client";
import { encryptSecret } from "../../src/lib/crypto";

const prisma = new PrismaClient();

type LegacyBusinessRow = {
  id: string;
  name: string;
  ownerId: string | null;
  phoneNumberId: string;
  displayPhone: string | null;
  whatsappToken: string;
  whatsappCredentialId: string | null;
  isActive: boolean;
};

async function migrateBusiness(business: LegacyBusinessRow): Promise<void> {
  let whatsappCredentialId = business.whatsappCredentialId;

  if (!whatsappCredentialId && business.whatsappToken && business.ownerId) {
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

    whatsappCredentialId = credential.id;
  } else if (!whatsappCredentialId && business.whatsappToken && !business.ownerId) {
    console.error(
      `  WARNING: ${business.name} (${business.id}) has no owner — its WhatsApp token cannot be wrapped into a Credential (Credential.ownerId is required) and will be LOST once the contract migration drops the legacy column. Assign an owner and re-run before contracting, or accept this business loses WhatsApp sending.`
    );
  }

  const phoneNumber = await prisma.phoneNumber.create({
    data: {
      businessId: business.id,
      phoneNumberId: business.phoneNumberId,
      displayPhone: business.displayPhone,
      whatsappCredentialId,
      isActive: business.isActive,
    },
  });

  console.log(
    `  ${business.name}: created PhoneNumber ${phoneNumber.id} (${phoneNumber.phoneNumberId})`
  );
}

async function main(): Promise<void> {
  const migrated = await prisma.phoneNumber.findMany({ select: { businessId: true } });
  const migratedIds = new Set(migrated.map((p) => p.businessId));

  const businesses = await prisma.$queryRaw<LegacyBusinessRow[]>`
    SELECT id, name, "ownerId", "phoneNumberId", "displayPhone", "whatsappToken", "whatsappCredentialId", "isActive"
    FROM "Business"
  `;
  const pending = businesses.filter((b) => !migratedIds.has(b.id));

  console.log(`Found ${pending.length} business(es) without a PhoneNumber yet.`);

  for (const business of pending) {
    await migrateBusiness(business);
  }

  // Always run, independent of which businesses were pending above: a
  // PhoneNumber may already exist from an interrupted previous run whose
  // conversation backfill never completed, so gating this on "just
  // migrated" would leave those conversations unlinked forever (and the
  // contract migration's Conversation.phoneNumberId NOT NULL would then
  // fail). Safe to re-run — only touches rows still missing a link.
  const count = await prisma.$executeRaw`
    UPDATE "Conversation" c
    SET "phoneNumberId" = pn.id
    FROM "PhoneNumber" pn
    WHERE pn."businessId" = c."businessId" AND c."phoneNumberId" IS NULL
  `;
  console.log(`Backfilled phoneNumberId on ${count} conversation(s).`);

  console.log("Done.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
