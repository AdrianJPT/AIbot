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

    const res = await POST(buildRequest({ email: "new@test.local" }));

    expect(res.status).toBe(404);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("invites the user via Supabase and precreates the Prisma User row", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const newId = randomUUID();
    const email = `invited-${newId}@test.local`;
    inviteUserByEmail.mockResolvedValueOnce({
      data: { user: { id: newId } },
      error: null,
    });
    const { POST } = await import("../route");

    const res = await POST(buildRequest({ email, name: "Cliente Nuevo" }));
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
  });

  it("returns 400 when Supabase invite fails", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    inviteUserByEmail.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "already registered" },
    });
    const { POST } = await import("../route");

    const res = await POST(buildRequest({ email: "dup@test.local" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("already registered");
  });
});
