import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/scope";
import { cleanupOwnershipFixtures, createTestUser } from "@/lib/__tests__/fixtures/ownership";

const getSessionUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  getSessionUser: () => getSessionUser(),
  requireAdmin: async () => {
    const user = await getSessionUser();
    return user && isAdmin(user) ? user : null;
  },
}));

const inviteUserByEmail = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { inviteUserByEmail } } }),
}));

function validBusiness(suffix: string) {
  return {
    name: `Test Business ${suffix}`,
    phoneNumberId: `test-invite-${suffix}-${randomUUID()}`,
    whatsappToken: "test-token",
    systemPrompt: "test prompt",
    welcomeMessage: "hola",
    businessInfo: {},
  };
}

function buildRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.com/api/admin/clients", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/admin/clients", () => {
  let admin: User;
  const invitedIds: string[] = [];

  beforeAll(async () => {
    admin = await createTestUser("invite-admin", "admin");
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([admin.id, ...invitedIds]);
  });

  it("returns 404 for a non-admin caller", async () => {
    const other = await createTestUser("invite-nonadmin");
    invitedIds.push(other.id);
    getSessionUser.mockResolvedValueOnce(other);
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest({ email: "new@test.local", business: validBusiness("nonadmin") })
    );

    expect(res.status).toBe(404);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("returns 400 when business fields are missing, without inviting", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest({ email: "no-business@test.local", business: { name: "Solo nombre" } })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(body.error).toBeTruthy();
  });

  it("invites without any business (assign later)", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const newId = randomUUID();
    const email = `invited-bare-${newId}@test.local`;
    inviteUserByEmail.mockResolvedValueOnce({
      data: { user: { id: newId } },
      error: null,
    });
    const { POST } = await import("../route");

    const res = await POST(buildRequest({ email }));
    invitedIds.push(newId);

    expect(res.status).toBe(200);
    const businesses = await prisma.business.count({ where: { ownerId: newId } });
    expect(businesses).toBe(0);
  });

  it("hands over an existing business via businessId", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const existing = await prisma.business.create({
      data: {
        name: "Pre-built business",
        systemPrompt: "p",
        welcomeMessage: "w",
        businessInfo: {},
        ownerId: admin.id,
      },
    });
    const newId = randomUUID();
    const email = `invited-handover-${newId}@test.local`;
    inviteUserByEmail.mockResolvedValueOnce({
      data: { user: { id: newId } },
      error: null,
    });
    const { POST } = await import("../route");

    const res = await POST(buildRequest({ email, businessId: existing.id }));
    invitedIds.push(newId);

    expect(res.status).toBe(200);
    const stored = await prisma.business.findUnique({ where: { id: existing.id } });
    expect(stored?.ownerId).toBe(newId);
  });

  it("returns 400 when both business and businessId are sent, without inviting", async () => {
    inviteUserByEmail.mockClear();
    getSessionUser.mockResolvedValueOnce(admin);
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest({
        email: "both@test.local",
        businessId: "some-id",
        business: validBusiness("both"),
      })
    );

    expect(res.status).toBe(400);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("invites the user via Supabase, precreates the Prisma User row, and creates their business+number", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const newId = randomUUID();
    const email = `invited-${newId}@test.local`;
    inviteUserByEmail.mockResolvedValueOnce({
      data: { user: { id: newId } },
      error: null,
    });
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest({ email, name: "Cliente Nuevo", business: validBusiness("ok") })
    );
    const created = await res.json();
    invitedIds.push(newId);

    expect(res.status).toBe(200);
    expect(created.email).toBe(email);
    expect(created.role).toBe("client");
    expect(inviteUserByEmail).toHaveBeenCalledWith(
      email,
      expect.objectContaining({ data: { full_name: "Cliente Nuevo" } })
    );

    const stored = await prisma.user.findUnique({ where: { id: newId } });
    expect(stored?.email).toBe(email);

    const business = await prisma.business.findFirst({
      where: { ownerId: newId },
      include: { phoneNumbers: true },
    });
    expect(business?.phoneNumbers).toHaveLength(1);
  });

  it("returns 409 for a duplicate phoneNumberId without inviting (checked before Supabase call)", async () => {
    inviteUserByEmail.mockClear();
    getSessionUser.mockResolvedValueOnce(admin);
    const owner = await createTestUser("invite-dup-owner");
    invitedIds.push(owner.id);
    const taken = validBusiness("dup-target");
    await prisma.business.create({
      data: {
        name: taken.name,
        systemPrompt: taken.systemPrompt,
        welcomeMessage: taken.welcomeMessage,
        businessInfo: taken.businessInfo,
        ownerId: owner.id,
        phoneNumbers: { create: { phoneNumberId: taken.phoneNumberId } },
      },
    });
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest({
        email: "dup-phone@test.local",
        business: { ...validBusiness("dup-attempt"), phoneNumberId: taken.phoneNumberId },
      })
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(body.error).toMatch(/ya está registrado/);
  });

  it("returns 400 when Supabase invite fails, without creating a business", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    inviteUserByEmail.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "already registered" },
    });
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest({ email: "dup@test.local", business: validBusiness("invite-fail") })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("already registered");
  });
});
