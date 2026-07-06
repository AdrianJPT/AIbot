import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Business, PhoneNumber, User } from "@prisma/client";
import { isAdmin } from "@/lib/scope";
import {
  cleanupOwnershipFixtures,
  createTestBusiness,
  createTestCredential,
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

function buildRequest(method: string, body?: unknown): NextRequest {
  return new NextRequest("https://example.com/api/businesses/x/phone-numbers", {
    method,
    ...(body !== undefined && { body: JSON.stringify(body) }),
    headers: { "content-type": "application/json" },
  });
}

describe("GET/POST /api/businesses/[id]/phone-numbers", () => {
  let owner: User;
  let other: User;
  let admin: User;
  let business: Business & { phoneNumbers: PhoneNumber[] };

  beforeAll(async () => {
    owner = await createTestUser("phone-numbers-owner");
    other = await createTestUser("phone-numbers-other");
    admin = await createTestUser("phone-numbers-admin", "admin");
    business = await createTestBusiness(owner.id, "phone-numbers");
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([owner.id, other.id, admin.id]);
  });

  it("GET returns 401 when unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const { GET } = await import("../route");

    const res = await GET(buildRequest("GET"), {
      params: Promise.resolve({ id: business.id }),
    });

    expect(res.status).toBe(401);
  });

  it("GET returns 404 for a caller who doesn't own the business", async () => {
    getSessionUser.mockResolvedValueOnce(other);
    const { GET } = await import("../route");

    const res = await GET(buildRequest("GET"), {
      params: Promise.resolve({ id: business.id }),
    });

    expect(res.status).toBe(404);
  });

  it("GET returns the owner's phone numbers", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET(buildRequest("GET"), {
      params: Promise.resolve({ id: business.id }),
    });
    const list = await res.json();

    expect(res.status).toBe(200);
    expect(list).toHaveLength(1);
    expect(list[0].phoneNumberId).toBe(business.phoneNumbers[0].phoneNumberId);
  });

  it("POST returns 404 for a non-admin caller", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest("POST", { phoneNumberId: "new-number", whatsappToken: "tok" }),
      { params: Promise.resolve({ id: business.id }) }
    );

    expect(res.status).toBe(404);
  });

  it("POST adds a second number to the business for an admin caller", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest("POST", {
        phoneNumberId: `test-second-${business.id}`,
        displayPhone: "+54 9 11 5555-5555",
        whatsappToken: "tok",
      }),
      { params: Promise.resolve({ id: business.id }) }
    );
    const created = await res.json();

    expect(res.status).toBe(200);
    expect(created.displayPhone).toBe("+54 9 11 5555-5555");
    expect(created.businessId).toBe(business.id);
  });

  it("POST returns 400 when whatsappCredentialId belongs to a different owner", async () => {
    const otherAdmin = await createTestUser("phone-numbers-other-admin", "admin");
    const foreignCredential = await createTestCredential(otherAdmin.id, { kind: "whatsapp" });
    getSessionUser.mockResolvedValueOnce(admin);
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest("POST", {
        phoneNumberId: `test-foreign-cred-${business.id}`,
        whatsappCredentialId: foreignCredential.id,
      }),
      { params: Promise.resolve({ id: business.id }) }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Credencial inválida");

    await cleanupOwnershipFixtures([otherAdmin.id]);
  });

  it("POST returns 409 with a friendly message on a duplicate phoneNumberId", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest("POST", {
        phoneNumberId: business.phoneNumbers[0].phoneNumberId,
        whatsappToken: "tok",
      }),
      { params: Promise.resolve({ id: business.id }) }
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/ya está registrado/);
  });
});
