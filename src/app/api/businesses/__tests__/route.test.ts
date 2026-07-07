import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { User } from "@prisma/client";
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

function buildRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.com/api/businesses", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("GET/POST /api/businesses", () => {
  let owner: User;
  let other: User;
  let admin: User;

  beforeAll(async () => {
    owner = await createTestUser("owner");
    other = await createTestUser("other");
    admin = await createTestUser("businesses-admin", "admin");
    await createTestBusiness(owner.id, "owned-by-owner");
    await createTestBusiness(other.id, "owned-by-other");
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([owner.id, other.id, admin.id]);
  });

  it("GET returns 401 when unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const { GET } = await import("../route");

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it("GET returns only the caller's own businesses", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET();
    const list = await res.json();

    expect(res.status).toBe(200);
    expect(list.every((b: { ownerId: string }) => b.ownerId === owner.id)).toBe(true);
    expect(list.some((b: { ownerId: string }) => b.ownerId === other.id)).toBe(false);
  });

  it("GET returns businesses from every owner for an admin caller", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { GET } = await import("../route");

    const res = await GET();
    const list = await res.json();

    expect(res.status).toBe(200);
    expect(list.some((b: { ownerId: string }) => b.ownerId === owner.id)).toBe(true);
    expect(list.some((b: { ownerId: string }) => b.ownerId === other.id)).toBe(true);
  });

  it("POST returns 404 when unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const { POST } = await import("../route");

    const res = await POST(buildRequest({}));

    expect(res.status).toBe(404);
  });

  it("POST returns 404 for a non-admin caller", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest({
        ownerId: owner.id,
        name: "New Biz",
        phoneNumberId: `test-new-${Date.now()}`,
        whatsappToken: "tok",
        systemPrompt: "prompt",
        welcomeMessage: "hola",
      })
    );

    expect(res.status).toBe(404);
  });

  it("POST creates a business owned by the given client when called by an admin", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest({
        ownerId: owner.id,
        name: "New Biz",
        phoneNumberId: `test-new-${Date.now()}`,
        whatsappToken: "tok",
        systemPrompt: "prompt",
        welcomeMessage: "hola",
      })
    );
    const created = await res.json();

    expect(res.status).toBe(200);
    expect(created.ownerId).toBe(owner.id);

    await prisma.business.delete({ where: { id: created.id } });
  });

  it("POST without ownerId creates a business owned by the admin, with no number and no credential", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest({
        name: "Business-first Biz",
        systemPrompt: "prompt",
        welcomeMessage: "hola",
      })
    );
    const created = await res.json();

    expect(res.status).toBe(200);
    expect(created.ownerId).toBe(admin.id);

    const stored = await prisma.business.findUnique({
      where: { id: created.id },
      include: { phoneNumbers: true },
    });
    expect(stored?.phoneNumbers).toHaveLength(0);

    await prisma.business.delete({ where: { id: created.id } });
  });

  it("POST rejects a WhatsApp token without a phoneNumberId to attach it to", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest({
        name: "Tokened Biz",
        systemPrompt: "prompt",
        welcomeMessage: "hola",
        whatsappToken: "tok",
      })
    );

    expect(res.status).toBe(400);
  });
});
