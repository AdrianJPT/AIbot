import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Business, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  cleanupOwnershipFixtures,
  createTestBusiness,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";

const getSessionUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  getSessionUser: () => getSessionUser(),
}));

function buildRequest(query = ""): NextRequest {
  return new NextRequest(`https://example.com/api/events${query}`);
}

describe("GET /api/events", () => {
  let owner: User;
  let other: User;
  let ownerBusiness: Business;
  let otherBusiness: Business;
  const eventIds: string[] = [];

  beforeAll(async () => {
    owner = await createTestUser("events-owner");
    other = await createTestUser("events-other");
    ownerBusiness = await createTestBusiness(owner.id, "events-owner-biz");
    otherBusiness = await createTestBusiness(other.id, "events-other-biz");

    const ownEvent = await prisma.eventLog.create({
      data: {
        level: "error",
        source: "ai",
        message: "owner's event",
        businessId: ownerBusiness.id,
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
    eventIds.push(ownEvent.id, otherEvent.id, globalEvent.id);
  });

  afterAll(async () => {
    await prisma.eventLog.deleteMany({ where: { id: { in: eventIds } } });
    await cleanupOwnershipFixtures([owner.id, other.id]);
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const { GET } = await import("../route");

    const res = await GET(buildRequest());
    expect(res.status).toBe(401);
  });

  it("scopes results to the caller's businesses plus global (null businessId) events", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET(buildRequest());
    const body = await res.json();

    const messages = body.events.map((e: { message: string }) => e.message);
    expect(messages).toContain("owner's event");
    expect(messages).toContain("global startup warning");
    expect(messages).not.toContain("other's event");
  });

  it("filters by level and source", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET(buildRequest("?level=warn&source=webhook"));
    const body = await res.json();

    const messages = body.events.map((e: { message: string }) => e.message);
    expect(messages).toContain("global startup warning");
    expect(messages).not.toContain("owner's event");
  });
});
