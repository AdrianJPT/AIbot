import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Business, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { eventLogScope, messageScope } from "@/lib/scope";
import {
  cleanupOwnershipFixtures,
  createTestBusiness,
  createTestConversation,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";

/**
 * Real-Postgres proof that `messageScope`/`eventLogScope` — the analytics
 * tenant filters spec #1408's "A second tenant's traffic never appears in
 * the first tenant's totals" scenario depends on — actually exclude a
 * second tenant's rows when run against Postgres, not just that they build
 * the right `where` shape (see scope.test.ts for that). Two owners, two
 * businesses, real rows for both; user1's query must come back with zero
 * business-B-derived data.
 */
describe("cross-tenant isolation: messageScope / eventLogScope", () => {
  let user1: User;
  let user2: User;
  let businessA: Business;
  let businessB: Business;
  const eventIds: string[] = [];

  beforeAll(async () => {
    user1 = await createTestUser("scope-xtenant-1");
    user2 = await createTestUser("scope-xtenant-2");
    businessA = await createTestBusiness(user1.id, "scope-xtenant-a");
    businessB = await createTestBusiness(user2.id, "scope-xtenant-b");

    const conversationA = await createTestConversation(
      businessA.id,
      "scope-xtenant-a",
    );
    const conversationB = await createTestConversation(
      businessB.id,
      "scope-xtenant-b",
    );

    await prisma.message.create({
      data: {
        conversationId: conversationA.id,
        role: "user",
        content: "business A message",
        sentBy: "customer",
      },
    });
    await prisma.message.create({
      data: {
        conversationId: conversationB.id,
        role: "user",
        content: "business B message",
        sentBy: "customer",
      },
    });

    const eventA = await prisma.eventLog.create({
      data: {
        level: "error",
        source: "ai",
        message: "business A event",
        businessId: businessA.id,
      },
    });
    const eventB = await prisma.eventLog.create({
      data: {
        level: "error",
        source: "ai",
        message: "business B event",
        businessId: businessB.id,
      },
    });
    const globalEvent = await prisma.eventLog.create({
      data: {
        level: "warn",
        source: "webhook",
        message: "no-business event",
        businessId: null,
      },
    });
    eventIds.push(eventA.id, eventB.id, globalEvent.id);
  });

  afterAll(async () => {
    await prisma.eventLog.deleteMany({ where: { id: { in: eventIds } } });
    await cleanupOwnershipFixtures([user1.id, user2.id]);
  });

  it("messageScope(user1) never returns business B's messages", async () => {
    const messages = await prisma.message.findMany({
      where: messageScope(user1),
    });
    const contents = messages.map((m) => m.content);

    expect(contents).toContain("business A message");
    expect(contents).not.toContain("business B message");
  });

  it("eventLogScope(user1, [businessA.id]) never returns business B's events", async () => {
    const events = await prisma.eventLog.findMany({
      where: {
        id: { in: eventIds },
        ...eventLogScope(user1, [businessA.id]),
      },
    });
    const messages = events.map((e) => e.message);

    expect(messages).toContain("business A event");
    expect(messages).toContain("no-business event");
    expect(messages).not.toContain("business B event");
  });
});
