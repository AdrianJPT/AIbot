import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  cleanupOwnershipFixtures,
  createTestBusiness,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";

/**
 * Proves the slice-1 indexes (`sdd/conversation-list-scale/design`, D1-D3)
 * are actually reachable by the planner for the four admin/budget queries
 * that motivated them — not just that the indexes exist.
 *
 * `enable_seqscan = off` is forced for the session instead of seeding
 * thousands of rows: on a handful of fixture rows Postgres's own cost
 * estimator correctly prefers a Seq Scan (it's cheaper at that size), which
 * would make an index-existence assertion here flaky/misleading regardless
 * of which index this migration adds. Forcing seqscan off answers the
 * narrower, still load-bearing question this test exists for: "is this
 * query index-servable by the index we just added", which is a property of
 * schema + query shape, not row count. `EXPLAIN (ANALYZE)` still executes
 * the real plan (not just a static analyze), so a genuinely unusable index
 * (wrong column order, wrong operator class, etc.) still fails this test.
 */

type PlanNode = {
  "Node Type": string;
  "Index Name"?: string;
  Plans?: PlanNode[];
  [key: string]: unknown;
};

type PlanSummary = { nodeTypes: string[]; indexNames: string[] };

/**
 * `enable_seqscan = off` forces the planner off Seq Scan, but it does NOT
 * guarantee the specific index this migration adds gets used — with
 * near-empty fixture tables the planner is free to satisfy the ban with any
 * other available index (e.g. a full scan of the primary key), which is a
 * valid plan but proves nothing about the index under test. So this also
 * collects every `Index Name` in the plan and callers assert the exact
 * expected index appears, not just "some index, any index".
 *
 * `SET LOCAL` only takes effect for the remainder of the CURRENT transaction
 * — outside an explicit transaction block it is a silent no-op (Postgres
 * just warns), so it has to run in the same `$transaction` as the `EXPLAIN`
 * itself, on the same pooled connection, or `enable_seqscan` stays at its
 * default and this test flakes based on row count instead of proving
 * index-servability.
 */
async function explain(sql: string): Promise<PlanSummary> {
  const rows = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
    return tx.$queryRawUnsafe<{ "QUERY PLAN": PlanNode[] }[]>(
      `EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`,
    );
  });
  const root = rows[0]["QUERY PLAN"][0].Plan;
  const nodeTypes: string[] = [];
  const indexNames: string[] = [];
  const walk = (node: PlanNode) => {
    nodeTypes.push(node["Node Type"]);
    if (node["Index Name"]) indexNames.push(node["Index Name"]);
    node.Plans?.forEach(walk);
  };
  walk(root as unknown as PlanNode);
  return { nodeTypes, indexNames };
}

describe("conversation-list-scale slice 1: index-served queries", () => {
  const ownerIds: string[] = [];

  afterAll(async () => {
    await cleanupOwnershipFixtures(ownerIds);
  });

  it("admin sort by lastMessageAt (no businessId qualifier) is index-served", async () => {
    const { nodeTypes, indexNames } = await explain(
      `SELECT id FROM "Conversation" ORDER BY "lastMessageAt" DESC LIMIT 20`,
    );

    expect(nodeTypes).not.toContain("Seq Scan");
    expect(indexNames).toContain("Conversation_lastMessageAt_idx");
  });

  it("admin createdAt range (no businessId qualifier) is index-served", async () => {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { nodeTypes, indexNames } = await explain(
      `SELECT count(*) FROM "Conversation" WHERE "createdAt" >= '${startOfDay.toISOString()}'`,
    );

    expect(nodeTypes).not.toContain("Seq Scan");
    expect(indexNames).toContain("Conversation_createdAt_idx");
  });

  it("admin status filter + sort (no businessId qualifier) is index-served", async () => {
    const { nodeTypes, indexNames } = await explain(
      `SELECT id FROM "Conversation" WHERE status = 'active' ORDER BY "lastMessageAt" DESC LIMIT 20`,
    );

    expect(nodeTypes).not.toContain("Seq Scan");
    expect(indexNames).toContain("Conversation_status_lastMessageAt_idx");
  });

  it("daily AI-reply budget check (Message.sentBy + createdAt) is index-served", async () => {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { nodeTypes, indexNames } = await explain(
      `SELECT count(*) FROM "Message" WHERE "sentBy" = 'bot' AND "createdAt" >= '${startOfDay.toISOString()}'`,
    );

    expect(nodeTypes).not.toContain("Seq Scan");
    expect(indexNames).toContain("Message_sentBy_createdAt_idx");
  });

  it("fixtures still resolve through the ordinary Prisma client (sanity check)", async () => {
    const owner = await createTestUser("scale-idx-sanity");
    ownerIds.push(owner.id);
    const business = await createTestBusiness(owner.id, "scale-idx-sanity");

    const conversation = await prisma.conversation.create({
      data: {
        businessId: business.id,
        phoneNumberId: business.phoneNumbers[0].id,
        customerPhone: "+5215500000000",
        customerName: "Índice de prueba",
      },
    });

    expect(conversation.id).toBeTruthy();
  });
});
