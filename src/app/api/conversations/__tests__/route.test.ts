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
    const otherBusiness = await createTestBusiness(
      other.id,
      "conv-search-other",
    );
    const secondPhoneNumber = await prisma.phoneNumber.create({
      data: {
        businessId: business.id,
        phoneNumberId: `conv-search-second-${business.id}`,
      },
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

    expect(body.items).toHaveLength(1);
    expect(body.items[0].customerName).toBe("Ana García");
  });

  it("filters by customerPhone", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET(buildRequest("?q=9998888"));
    const body = await res.json();

    expect(body.items).toHaveLength(1);
    expect(body.items[0].customerName).toBe("Luis Pérez");
  });

  it("returns all conversations when q is empty", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET(buildRequest());
    const body = await res.json();

    expect(body.items).toHaveLength(2);
  });

  it("filters by phoneNumberId, scoping to just that number's conversations", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET(
      buildRequest(`?phoneNumberId=${business.phoneNumbers[0].id}`),
    );
    const body = await res.json();

    expect(body.items).toHaveLength(1);
    expect(body.items[0].customerName).toBe("Ana García");
  });

  it("filters by businessId, scoping to just that business's conversations", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { GET } = await import("../route");

    const res = await GET(buildRequest(`?businessId=${business.id}`));
    const body = await res.json();

    const names = body.items.map(
      (c: { customerName: string | null }) => c.customerName,
    );
    expect(names.sort()).toEqual(["Ana García", "Luis Pérez"]);
  });

  it("returns conversations across every owner for an admin caller", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { GET } = await import("../route");

    const res = await GET(buildRequest());
    const body = await res.json();

    const names = body.items.map(
      (c: { customerName: string | null }) => c.customerName,
    );
    expect(names).toContain("Ana García");
    expect(names).toContain("Otro cliente");
  });

  it("reports scope.admin and scope.businessIds for a client caller", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET(buildRequest());
    const body = await res.json();

    expect(body.scope.admin).toBe(false);
    expect(body.scope.businessIds).toEqual([business.id]);
  });

  it("reports scope.admin true with no businessIds constraint for an admin caller", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { GET } = await import("../route");

    const res = await GET(buildRequest());
    const body = await res.json();

    expect(body.scope.admin).toBe(true);
    expect(body.scope.businessIds).toEqual([]);
  });
});

describe("GET /api/conversations — cursor pagination", () => {
  let owner: User;
  let business: Business & { phoneNumbers: PhoneNumber[] };

  beforeAll(async () => {
    owner = await createTestUser("page-owner");
    business = await createTestBusiness(owner.id, "conv-page");

    // 25 conversations, strictly increasing lastMessageAt so ordering (and
    // therefore cursor pages) is deterministic.
    for (let i = 0; i < 25; i++) {
      await prisma.conversation.create({
        data: {
          businessId: business.id,
          phoneNumberId: business.phoneNumbers[0].id,
          customerPhone: `+5215500${String(i).padStart(4, "0")}`,
          customerName: `Cliente ${String(i).padStart(2, "0")}`,
          lastMessageAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
        },
      });
    }
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([owner.id]);
  });

  it("defaults to a page size of 20 with a nextCursor", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET(buildRequest());
    const body = await res.json();

    expect(body.items).toHaveLength(20);
    expect(body.nextCursor).not.toBeNull();
    // Newest first: Cliente 24 has the latest lastMessageAt.
    expect(body.items[0].customerName).toBe("Cliente 24");
  });

  it("pages through the remainder via cursor without overlap or gaps", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const first = await (await GET(buildRequest())).json();

    getSessionUser.mockResolvedValueOnce(owner);
    const second = await (
      await GET(buildRequest(`?cursor=${first.nextCursor}`))
    ).json();

    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();

    const firstIds = first.items.map((c: { id: string }) => c.id);
    const secondIds = second.items.map((c: { id: string }) => c.id);
    expect(new Set([...firstIds, ...secondIds]).size).toBe(25);
  });

  it("clamps an oversized limit to MAX_LIMIT", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET(buildRequest("?limit=1000"));
    const body = await res.json();

    expect(body.items).toHaveLength(25);
    expect(body.nextCursor).toBeNull();
  });
});

describe("GET /api/conversations — status filtering", () => {
  let owner: User;
  let business: Business & { phoneNumbers: PhoneNumber[] };

  beforeAll(async () => {
    owner = await createTestUser("status-owner");
    business = await createTestBusiness(owner.id, "conv-status");

    await prisma.conversation.create({
      data: {
        businessId: business.id,
        phoneNumberId: business.phoneNumbers[0].id,
        customerPhone: "+5215500011111",
        customerName: "Activo",
        status: "active",
      },
    });
    await prisma.conversation.create({
      data: {
        businessId: business.id,
        phoneNumberId: business.phoneNumbers[0].id,
        customerPhone: "+5215500022222",
        customerName: "Cerrado",
        status: "closed",
      },
    });
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([owner.id]);
  });

  it("filters server-side by status", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET(buildRequest("?status=closed"));
    const body = await res.json();

    expect(body.items).toHaveLength(1);
    expect(body.items[0].customerName).toBe("Cerrado");
  });
});

describe("GET /api/conversations — multiBusiness aggregation", () => {
  let owner: User;
  let admin: User;
  let businessA: Business & { phoneNumbers: PhoneNumber[] };
  let businessB: Business & { phoneNumbers: PhoneNumber[] };

  beforeAll(async () => {
    owner = await createTestUser("multi-owner");
    admin = await createTestUser("multi-admin", "admin");
    businessA = await createTestBusiness(owner.id, "conv-multi-a");
    businessB = await createTestBusiness(owner.id, "conv-multi-b");

    for (let i = 0; i < 15; i++) {
      await prisma.conversation.create({
        data: {
          businessId: businessA.id,
          phoneNumberId: businessA.phoneNumbers[0].id,
          customerPhone: `+5215501${String(i).padStart(4, "0")}`,
          lastMessageAt: new Date(Date.UTC(2026, 0, 2, 0, 0, i)),
        },
      });
    }
    await prisma.conversation.create({
      data: {
        businessId: businessB.id,
        phoneNumberId: businessB.phoneNumbers[0].id,
        customerPhone: "+5215502000000",
        lastMessageAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
      },
    });
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([owner.id, admin.id]);
  });

  it("is true on the first page when it spans multiple businesses", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { GET } = await import("../route");

    const res = await GET(buildRequest(`?businessId=${businessA.id}&limit=5`));
    const body = await res.json();

    // Single-business filter: only one business represented.
    expect(body.multiBusiness).toBe(false);
  });

  it("is true on the first (unfiltered) page across businesses, false on later pages", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { GET } = await import("../route");

    const first = await (await GET(buildRequest("?limit=5"))).json();
    expect(first.multiBusiness).toBe(true);

    getSessionUser.mockResolvedValueOnce(admin);
    const second = await (
      await GET(buildRequest(`?limit=5&cursor=${first.nextCursor}`))
    ).json();
    expect(second.multiBusiness).toBe(false);
  });
});
