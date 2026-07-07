import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/scope";
import {
  cleanupOwnershipFixtures,
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

function buildRequest(body?: unknown): NextRequest {
  return new NextRequest("https://example.com", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/credentials/[id]/swap-priority", () => {
  let admin: User;
  let owner: User;

  beforeAll(async () => {
    admin = await createTestUser("swap-priority-admin", "admin");
    owner = await createTestUser("swap-priority-owner");
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([admin.id, owner.id]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("atomically swaps the priority of both credentials in one transaction", async () => {
    getSessionUser.mockResolvedValue(admin);
    const { POST } = await import("../route");
    const first = await createTestCredential(owner.id, { kind: "ai", priority: 0 });
    const second = await createTestCredential(owner.id, { kind: "ai", priority: 1 });

    const res = await POST(buildRequest({ withId: second.id }), ctx(first.id));
    expect(res.status).toBe(200);

    const rows = await prisma.credential.findMany({
      where: { id: { in: [first.id, second.id] } },
    });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.priority]));
    expect(byId[first.id]).toBe(1);
    expect(byId[second.id]).toBe(0);
  });

  it("returns 400 when withId is missing", async () => {
    getSessionUser.mockResolvedValue(admin);
    const { POST } = await import("../route");
    const cred = await createTestCredential(owner.id, { kind: "ai" });

    const res = await POST(buildRequest({}), ctx(cred.id));
    expect(res.status).toBe(400);
  });

  it("returns 400 when withId equals id", async () => {
    getSessionUser.mockResolvedValue(admin);
    const { POST } = await import("../route");
    const cred = await createTestCredential(owner.id, { kind: "ai" });

    const res = await POST(buildRequest({ withId: cred.id }), ctx(cred.id));
    expect(res.status).toBe(400);
  });

  it("returns 404 when either credential doesn't exist", async () => {
    getSessionUser.mockResolvedValue(admin);
    const { POST } = await import("../route");
    const cred = await createTestCredential(owner.id, { kind: "ai" });

    const res = await POST(buildRequest({ withId: "nonexistent" }), ctx(cred.id));
    expect(res.status).toBe(404);
  });

  it("returns 404 when either credential is not kind 'ai'", async () => {
    getSessionUser.mockResolvedValue(admin);
    const { POST } = await import("../route");
    const ai = await createTestCredential(owner.id, { kind: "ai" });
    const whatsapp = await createTestCredential(owner.id, { kind: "whatsapp" });

    const res = await POST(buildRequest({ withId: whatsapp.id }), ctx(ai.id));
    expect(res.status).toBe(404);
  });

  it("returns 404 for a non-admin caller", async () => {
    getSessionUser.mockResolvedValue(owner);
    const { POST } = await import("../route");
    const first = await createTestCredential(owner.id, { kind: "ai", priority: 0 });
    const second = await createTestCredential(owner.id, { kind: "ai", priority: 1 });

    const res = await POST(buildRequest({ withId: second.id }), ctx(first.id));
    expect(res.status).toBe(404);
  });
});
