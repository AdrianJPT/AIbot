import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Business, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/scope";
import {
  cleanupOwnershipFixtures,
  createTestBusiness,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";

const getSessionUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  getSessionUser: () => getSessionUser(),
  requireAdmin: async () => {
    const user = await getSessionUser();
    return user && isAdmin(user) ? user : null;
  },
}));

function buildRequest(query = ""): NextRequest {
  return new NextRequest(`https://example.com/api/events${query}`);
}

// /api/events is admin-only: the product owner needs to see errors across
// every client, so a "client" caller is turned away with a 404 (not
// 401/403), and an admin caller sees every event regardless of which
// business it's attached to.
describe("GET /api/events", () => {
  let admin: User;
  let client: User;
  let other: User;
  let clientBusiness: Business;
  let otherBusiness: Business;
  const eventIds: string[] = [];

  beforeAll(async () => {
    admin = await createTestUser("events-admin", "admin");
    client = await createTestUser("events-client");
    other = await createTestUser("events-other");
    clientBusiness = await createTestBusiness(client.id, "events-client-biz");
    otherBusiness = await createTestBusiness(other.id, "events-other-biz");

    const clientEvent = await prisma.eventLog.create({
      data: {
        level: "error",
        source: "ai",
        message: "client's event",
        businessId: clientBusiness.id,
      },
    });
    const otherEvent = await prisma.eventLog.create({
      data: {
        level: "error",
        source: "ai",
        message: "other's event",
        businessId: otherBusiness.id,
      },
    });
    const globalEvent = await prisma.eventLog.create({
      data: {
        level: "warn",
        source: "webhook",
        message: "global startup warning",
        businessId: null,
      },
    });
    eventIds.push(clientEvent.id, otherEvent.id, globalEvent.id);
  });

  afterAll(async () => {
    await prisma.eventLog.deleteMany({ where: { id: { in: eventIds } } });
    await cleanupOwnershipFixtures([admin.id, client.id, other.id]);
  });

  it("returns 404 when unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const { GET } = await import("../route");

    const res = await GET(buildRequest());
    expect(res.status).toBe(404);
  });

  it("returns 404 for a non-admin caller", async () => {
    getSessionUser.mockResolvedValueOnce(client);
    const { GET } = await import("../route");

    const res = await GET(buildRequest());
    expect(res.status).toBe(404);
  });

  it("returns every event, across every business, for an admin caller", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { GET } = await import("../route");

    const res = await GET(buildRequest());
    const body = await res.json();

    const messages = body.events.map((e: { message: string }) => e.message);
    expect(messages).toContain("client's event");
    expect(messages).toContain("other's event");
    expect(messages).toContain("global startup warning");
  });

  it("filters by level and source", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { GET } = await import("../route");

    const res = await GET(buildRequest("?level=warn&source=webhook"));
    const body = await res.json();

    const messages = body.events.map((e: { message: string }) => e.message);
    expect(messages).toContain("global startup warning");
    expect(messages).not.toContain("client's event");
  });
});
