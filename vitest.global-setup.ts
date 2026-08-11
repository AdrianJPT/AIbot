import { execFile } from "node:child_process";
import { connect } from "node:net";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const TEST_DB_HOST = "localhost";
const TEST_DB_PORT = 55432;

/**
 * How many Vitest workers the suite runs with, and therefore how many
 * isolated Postgres schemas exist. Pinned rather than derived from the CPU
 * count so the set of schemas is deterministic: `vitest.config.ts` caps
 * `maxWorkers` to this, and this file migrates exactly this many schemas.
 */
export const TEST_WORKER_COUNT = 4;

/** Base connection string, without a schema — the container's default database. */
export const TEST_DATABASE_URL = `postgresql://bot:testpass@${TEST_DB_HOST}:${TEST_DB_PORT}/whatsapp_bot`;

/**
 * Connection string for one worker. Each worker gets its own Postgres schema,
 * so two test files running concurrently cannot see each other's rows at all.
 *
 * This is what makes `fileParallelism: true` safe *structurally*. The suite
 * previously ran serially because admin-scoped queries read across every
 * owner, so a concurrent file's fixtures leaked into another file's results.
 * Scoping every assertion would have worked too, but only for as long as
 * every future test author remembered to do it — one `toHaveLength()` on an
 * unscoped admin listing brings the flake back. Separate schemas remove the
 * shared state instead of relying on discipline around it.
 */
export function workerDatabaseUrl(workerId: number): string {
  return `${TEST_DATABASE_URL}?schema=test_w${workerId}`;
}

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
 * then applies the migrations to every worker schema. Without the probe, a
 * missing container surfaces as dozens of opaque Prisma errors ("The table
 * `public.PhoneNumber` does not exist") instead of one sentence naming the
 * command to run.
 *
 * Uses `migrate deploy` rather than `db push` on purpose: production deploys
 * run the same command, so the suite exercises the real migration files
 * instead of a schema shortcut that would hide drift between them and
 * schema.prisma.
 *
 * Prisma creates a missing schema on its own, and `migrate deploy` is
 * idempotent, so a warm container only pays a fast `_prisma_migrations`
 * check.
 *
 * Every `CREATE INDEX CONCURRENTLY` migration in this repo (see
 * `prisma/migrations/20260811*`) is one statement per `migration.sql` file —
 * verified empirically that Prisma 5.22.0's `migrate deploy` wraps a
 * migration.sql containing more than one statement in an explicit
 * transaction, which `CONCURRENTLY` cannot run inside, regardless of whether
 * the connection URL has a `?schema=` param. A single-statement file is not
 * wrapped and applies cleanly here with no special-casing.
 *
 * The schemas are migrated SEQUENTIALLY, not in parallel, for the same
 * `CONCURRENTLY` reason: Prisma serializes all `migrate deploy` invocations
 * against one physical database behind a single database-wide advisory
 * lock, regardless of target schema. `CREATE INDEX CONCURRENTLY` separately
 * waits for every other in-progress transaction in the whole cluster to
 * finish its current snapshot before it can complete. Run four workers'
 * `migrate deploy` in parallel (`Promise.all`) once any of them contains a
 * CONCURRENTLY migration, and you get a genuine deadlock: whichever worker
 * holds the advisory lock and is mid-CONCURRENTLY-build waits on another
 * worker's still-open (lock-blocked) transaction, while that worker waits on
 * the lock the first one holds — Postgres detects the cycle and kills one
 * side (`deadlock detected`, SQLSTATE 40P01). Reproduced empirically on a
 * fresh container with all 4 workers racing; see the
 * `sdd/conversation-list-scale/apply-progress` note in Engram for the full
 * repro. Sequential application costs a little cold-start time (once per
 * container lifecycle, not per test run) in exchange for correctness.
 * Future `CONCURRENTLY` migrations MUST keep the one-statement-per-file
 * convention above, or this setup fails the transaction-wrap way instead.
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

  const workerIds = Array.from({ length: TEST_WORKER_COUNT }, (_, i) => i + 1);

  try {
    for (const id of workerIds) {
      const url = workerDatabaseUrl(id);
      await execFileAsync("npx", ["prisma", "migrate", "deploy"], {
        env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
      });
    }
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
