/**
 * One-off admin task: sets a User's `role` to "admin" or "client". The
 * product owner runs this manually after their first login (User rows are
 * created on first login, see `src/lib/auth.ts#getSessionUser`) to promote
 * their own account to admin — there is no UI for this by design, since
 * granting admin access is a rare, high-trust operation.
 *
 * Usage:
 *   npx tsx prisma/scripts/set-role.ts --email owner@example.com --role admin
 *   npx tsx prisma/scripts/set-role.ts --email someone@example.com --role client
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const VALID_ROLES = ["admin", "client"];

function parseArgs(argv: string[]): { email?: string; role?: string } {
  const result: { email?: string; role?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--email") result.email = argv[++i];
    if (argv[i] === "--role") result.role = argv[++i];
  }
  return result;
}

async function main() {
  const { email, role } = parseArgs(process.argv.slice(2));

  if (!email || !role) {
    console.error(
      "Usage: npx tsx prisma/scripts/set-role.ts --email <email> --role admin|client"
    );
    process.exit(1);
  }

  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role "${role}". Must be one of: ${VALID_ROLES.join(", ")}.`);
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(
      `No User found for email=${email}. The user must have logged in at least once ` +
        "(User rows are created on first login)."
    );
    process.exit(1);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role },
  });

  console.log(`Set role="${updated.role}" for ${updated.email} (${updated.id}).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
