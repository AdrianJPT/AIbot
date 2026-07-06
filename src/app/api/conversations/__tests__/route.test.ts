import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Business, PhoneNumber, User } from "@prisma/client";
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

function buildRequest(qs = ""): NextRequest {
  return new NextRequest(`https://example.com/api/conversations${qs}`);
}

describe("GET /api/conversations", () => {
  let owner: User;
  let other: User;
  let admin: User;
  let business: Business & { phoneNumbers: PhoneNumber[] };

  beforeAll(async () => {
    owner = await createTestUser("search-owner");
    other = await createTestUser("search-other");
    admin = await createTestUser("search-admin", "admin");
    business = await createTestBusiness(owner.id, "conv-search");
    const otherBusiness = await createTestBusiness(other.id, "conv-search-other");
    const secondPhoneNumber = await prisma.phoneNumber.create({
      data: { businessId: business.id, phoneNumberId: `conv-search-second-${business.id}` },
    });
    await prisma.conversation.create({
      data: {
        businessId: business.id,
        phoneNumberId: business.phoneNumbers[0].id,
        customerPhone: "+5215500001111",
        customerName: "Ana García",
      },
    });
    await prisma.conversation.create({
      data: {
        businessId: business.id,
        phoneNumberId: secondPhoneNumber.id,
        customerPhone: "+5215599998888",
        customerName: "Luis Pérez",
      },
    });
    await prisma.conversation.create({
      data: {
        businessId: otherBusiness.id,
        phoneNumberId: otherBusiness.phoneNumbers[0].id,
        customerPhone: "+5215511112222",
        customerName: "Otro cliente",
      },
    });
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([owner.id, other.id, admin.id]);
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const { GET } = await import("../route");

    const res = await GET(buildRequest());
    expect(res.status).toBe(401);
  });

  it("filters by customerName (case-insensitive, partial)", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET(buildRequest("?q=garc"));
    const body = await res.json();

    expect(body).toHaveLength(1);
    expect(body[0].customerName).toBe("Ana García");
  });

  it("filters by customerPhone", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET(buildRequest("?q=9998888"));
    const body = await res.json();

    expect(body).toHaveLength(1);
    expect(body[0].customerName).toBe("Luis Pérez");
  });

  it("returns all conversations when q is empty", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET(buildRequest());
    const body = await res.json();

    expect(body).toHaveLength(2);
  });

  it("filters by phoneNumberId, scoping to just that number's conversations", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET(buildRequest(`?phoneNumberId=${business.phoneNumbers[0].id}`));
    const body = await res.json();

    expect(body).toHaveLength(1);
    expect(body[0].customerName).toBe("Ana García");
  });

  it("returns conversations across every owner for an admin caller", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { GET } = await import("../route");

    const res = await GET(buildRequest());
    const body = await res.json();

    const names = body.map((c: { customerName: string | null }) => c.customerName);
    expect(names).toContain("Ana García");
    expect(names).toContain("Otro cliente");
  });
});
