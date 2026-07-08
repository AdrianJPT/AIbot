import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
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

function buildRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.com/api/credentials", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

// /api/credentials/** is admin-only: the product owner manages the shared
// credential pool centrally, so an admin caller must see every credential
// (not just ones they created), and a "client" caller is turned away with a
// 404 (not 401/403 — a client shouldn't be able to tell the route exists).
describe("GET/POST /api/credentials", () => {
  let admin: User;
  let client: User;
  let other: User;

  beforeAll(async () => {
    admin = await createTestUser("cred-admin", "admin");
    client = await createTestUser("cred-client");
    other = await createTestUser("cred-other");
    await createTestCredential(admin.id, { label: "owned-by-admin" });
    await createTestCredential(other.id, { label: "owned-by-other" });
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([admin.id, client.id, other.id]);
  });

  it("GET returns 404 when unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const { GET } = await import("../route");

    const res = await GET();

    expect(res.status).toBe(404);
  });

  it("GET returns 404 for a non-admin caller", async () => {
    getSessionUser.mockResolvedValueOnce(client);
    const { GET } = await import("../route");

    const res = await GET();

    expect(res.status).toBe(404);
  });

  it("GET returns every credential (across owners) for an admin caller", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { GET } = await import("../route");

    const res = await GET();
    const list = await res.json();

    expect(res.status).toBe(200);
    expect(list.some((c: { label: string }) => c.label === "owned-by-admin")).toBe(true);
    expect(list.some((c: { label: string }) => c.label === "owned-by-other")).toBe(true);
    expect(list.every((c: Record<string, unknown>) => !("encryptedKey" in c))).toBe(
      true
    );
  });

  it("POST returns 404 when unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const { POST } = await import("../route");

    const res = await POST(buildRequest({}));

    expect(res.status).toBe(404);
  });

  it("POST returns 404 for a non-admin caller", async () => {
    getSessionUser.mockResolvedValueOnce(client);
    const { POST } = await import("../route");

    const res = await POST(buildRequest({ kind: "ai", provider: "openai", label: "x", key: "sk-x" }));

    expect(res.status).toBe(404);
  });

  it("POST returns 400 on missing fields", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { POST } = await import("../route");

    const res = await POST(buildRequest({ kind: "ai" }));

    expect(res.status).toBe(400);
  });

  it("POST creates an encrypted credential owned by the admin caller", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest({
        kind: "ai",
        provider: "openai",
        label: "New key",
        key: "sk-abcd1234",
      })
    );
    const created = await res.json();

    expect(res.status).toBe(200);
    expect(created.keyLast4).toBe("1234");
    expect(created.encryptedKey).toBeUndefined();

    const row = await prisma.credential.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.ownerId).toBe(admin.id);
    expect(decryptSecret(row.encryptedKey)).toBe("sk-abcd1234");
  });

  it("POST appends a new ai credential at the end of the existing priority order", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { POST } = await import("../route");

    const existing = await createTestCredential(admin.id, {
      label: "existing-primary",
      priority: 5,
    });

    const res = await POST(
      buildRequest({
        kind: "ai",
        provider: "openai",
        label: "new-fallback",
        key: "sk-newfallback0000",
      })
    );
    const created = await res.json();

    expect(res.status).toBe(200);
    expect(created.priority).toBe(existing.priority + 1);
    expect(created.isActive).toBe(true);
  });

  it("POST returns 400 for a custom provider with no baseUrl", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest({ kind: "ai", provider: "custom", label: "x", key: "sk-x" })
    );

    expect(res.status).toBe(400);
  });

  it("POST creates a custom provider credential when baseUrl is given", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest({
        kind: "ai",
        provider: "custom",
        label: "my-custom",
        key: "sk-customkey0000",
        baseUrl: "https://api.example.com/v1",
      })
    );
    const created = await res.json();

    expect(res.status).toBe(200);
    expect(created.baseUrl).toBe("https://api.example.com/v1");
  });

  it("POST defaults the first ai credential for an owner to priority 0", async () => {
    const { POST } = await import("../route");
    const solo = await createTestUser("cred-solo-owner", "admin");

    try {
      getSessionUser.mockResolvedValueOnce(solo);
      const res = await POST(
        buildRequest({
          kind: "ai",
          provider: "openai",
          label: "first-ever",
          key: "sk-firstever0000",
        })
      );
      const created = await res.json();

      expect(res.status).toBe(200);
      expect(created.priority).toBe(0);
    } finally {
      await cleanupOwnershipFixtures([solo.id]);
    }
  });
});
