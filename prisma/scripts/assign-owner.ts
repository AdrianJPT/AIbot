/**
 * One-off backfill: assigns every ownerless (`ownerId = null`) Business to
 * a given user. Run manually after the product owner's first login, once
 * per environment (local, staging, prod) — see
 * docs/plan/PHASE2_MANUAL_STEPS.md, section 5.
 *
 * `Business.ownerId` stays nullable until this has run everywhere; making
 * it required is a deliberately deferred follow-up migration (see task 2.2
 * in docs/plan/02-auth-multitenancy.md), not part of this script.
 *
 * Usage:
 *   npx tsx prisma/scripts/assign-owner.ts --email owner@example.com
 *   npx tsx prisma/scripts/assign-owner.ts --user-id <supabase-uuid>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseArgs(argv: string[]): { email?: string; userId?: string } {
  const result: { email?: string; userId?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--email") result.email = argv[++i];
    if (argv[i] === "--user-id") result.userId = argv[++i];
  }
  return result;
}

async function main() {
  const { email, userId } = parseArgs(process.argv.slice(2));

  if (!email && !userId) {
    console.error(
      "Usage: npx tsx prisma/scripts/assign-owner.ts --email <email> | --user-id <uuid>"
    );
    process.exit(1);
  }

  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : await prisma.user.findUnique({ where: { email: email! } });

  if (!user) {
    console.error(
      `No User found for ${userId ? `id=${userId}` : `email=${email}`}. ` +
        "The user must have logged in at least once (User rows are created on first login)."
    );
    process.exit(1);
  }

  const { count } = await prisma.business.updateMany({
    where: { ownerId: null },
    data: { ownerId: user.id },
  });

  console.log(`Assigned ${count} ownerless business(es) to ${user.email} (${user.id}).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
