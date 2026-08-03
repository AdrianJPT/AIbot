import { TEST_WORKER_COUNT, workerDatabaseUrl } from "./vitest.global-setup";

/**
 * Points this worker at its own Postgres schema, before any test file (and
 * therefore any `PrismaClient`) is imported.
 *
 * `src/lib/db.ts` builds its client with no explicit datasource, so Prisma
 * reads `DATABASE_URL` from the environment at construction time — rewriting
 * it here is enough, and it also covers the ad-hoc `new PrismaClient()`
 * instances in `src/lib/outbox/__tests__/repository.test.ts`.
 *
 * `VITEST_POOL_ID` is 1-based and bounded by `maxWorkers`, which the config
 * pins to `TEST_WORKER_COUNT`. The modulo is a guard, not an expectation: if
 * a future Vitest ever hands out a higher id, two workers share a schema and
 * the suite gets slower and flakier rather than failing on a schema that was
 * never migrated.
 */
const poolId = Number(process.env.VITEST_POOL_ID ?? 1);
const workerId = ((poolId - 1) % TEST_WORKER_COUNT) + 1;
const url = workerDatabaseUrl(workerId);

process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
