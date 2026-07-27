import { execFileSync } from "node:child_process";
import { connect } from "node:net";

const TEST_DB_HOST = "localhost";
const TEST_DB_PORT = 55432;

/**
 * Connection string the suite runs against. Consumed by `vitest.config.ts`
 * (`test.env`) and backed by the `test-db` service in
 * `docker-compose.test.yml` — change all three together.
 */
export const TEST_DATABASE_URL = `postgresql://bot:testpass@${TEST_DB_HOST}:${TEST_DB_PORT}/whatsapp_bot`;

/** Resolves false when nothing is listening on the test database port. */
function isTestDbReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: TEST_DB_HOST, port: TEST_DB_PORT });
    const settle = (reachable: boolean) => {
      socket.destroy();
      resolve(reachable);
    };

    socket.setTimeout(2_000);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
  });
}

/**
 * Fails the run with actionable instructions when the test database isn't up,
 * then applies the migrations. Without this, a missing container surfaces as
 * dozens of opaque Prisma errors ("The table `public.PhoneNumber` does not
 * exist") instead of one sentence naming the command to run.
 *
 * Uses `migrate deploy` rather than `db push` on purpose: production deploys
 * run the same command, so the suite exercises the real migration files
 * instead of a schema shortcut that would hide drift between them and
 * schema.prisma.
 */
export default async function setup(): Promise<void> {
  if (!(await isTestDbReachable())) {
    throw new Error(
      [
        `Test database not reachable at ${TEST_DB_HOST}:${TEST_DB_PORT}.`,
        "",
        "Start it with:",
        "  npm run test:db:up",
        "",
        "It runs in its own container (docker-compose.test.yml) and is",
        "separate from the dev database on port 5432.",
      ].join("\n"),
    );
  }

  try {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: TEST_DATABASE_URL,
        DIRECT_URL: TEST_DATABASE_URL,
      },
    });
  } catch {
    throw new Error(
      [
        "`prisma migrate deploy` failed against the test database.",
        "",
        "The container is disposable, so the usual fix is to recreate it:",
        "  npm run test:db:down && npm run test:db:up",
      ].join("\n"),
    );
  }
}
