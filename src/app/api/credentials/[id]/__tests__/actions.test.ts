import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
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

const testAiCredential = vi.fn();
const testWhatsappCredential = vi.fn();
vi.mock("@/lib/credentials/provider-test", () => ({
  testAiCredential: (...args: unknown[]) => testAiCredential(...args),
  testWhatsappCredential: (...args: unknown[]) => testWhatsappCredential(...args),
}));

function buildRequest(url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

// These routes live under /api/credentials/** which is admin-only — `admin`
// is the caller for every action, `owner` is just whoever the fixture
// Credential rows happen to be assigned to (ownerId is bookkeeping, not a
// visibility scope, once the route requires admin).
describe("/api/credentials/[id] actions", () => {
  let admin: User;
  let owner: User;

  beforeAll(async () => {
    admin = await createTestUser("cred-actions-admin", "admin");
    owner = await createTestUser("cred-actions-owner");
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([admin.id, owner.id]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /test", () => {
    it("returns 404 when unauthenticated", async () => {
      getSessionUser.mockResolvedValueOnce(null);
      const { POST } = await import("../test/route");
      const cred = await createTestCredential(owner.id);

      const res = await POST(buildRequest("https://example.com", {}), ctx(cred.id));

      expect(res.status).toBe(404);
    });

    it("returns 404 for a non-admin caller", async () => {
      getSessionUser.mockResolvedValueOnce(owner);
      const { POST } = await import("../test/route");
      const cred = await createTestCredential(owner.id);

      const res = await POST(buildRequest("https://example.com", {}), ctx(cred.id));

      expect(res.status).toBe(404);
    });

    it("calls testAiCredential and persists success", async () => {
      getSessionUser.mockResolvedValueOnce(admin);
      testAiCredential.mockResolvedValueOnce({ ok: true });
      const { POST } = await import("../test/route");
      const cred = await createTestCredential(owner.id, { kind: "ai" });

      const res = await POST(buildRequest("https://example.com", {}), ctx(cred.id));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(testAiCredential).toHaveBeenCalledTimes(1);

      const row = await prisma.credential.findUniqueOrThrow({ where: { id: cred.id } });
      expect(row.lastError).toBeNull();
      expect(row.lastUsedAt).not.toBeNull();
    });

    it("persists lastError on failure", async () => {
      getSessionUser.mockResolvedValueOnce(admin);
      testAiCredential.mockResolvedValueOnce({ ok: false, error: "invalid key" });
      const { POST } = await import("../test/route");
      const cred = await createTestCredential(owner.id, { kind: "ai" });

      const res = await POST(buildRequest("https://example.com", {}), ctx(cred.id));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(false);

      const row = await prisma.credential.findUniqueOrThrow({ where: { id: cred.id } });
      expect(row.lastError).toBe("invalid key");
    });

    it("passes phoneNumberId through for whatsapp credentials", async () => {
      getSessionUser.mockResolvedValueOnce(admin);
      testWhatsappCredential.mockResolvedValueOnce({ ok: true });
      const { POST } = await import("../test/route");
      const cred = await createTestCredential(owner.id, { kind: "whatsapp" });

      await POST(
        buildRequest("https://example.com", { phoneNumberId: "123" }),
        ctx(cred.id)
      );

      expect(testWhatsappCredential).toHaveBeenCalledWith(
        expect.objectContaining({ id: cred.id }),
        "123"
      );
    });
  });

  describe("POST /activate", () => {
    it("sets exactly one active credential per owner+kind", async () => {
      getSessionUser.mockResolvedValueOnce(admin);
      const { POST } = await import("../activate/route");

      const active = await createTestCredential(owner.id, {
        kind: "ai",
        status: "active",
      });
      const standby = await createTestCredential(owner.id, {
        kind: "ai",
        status: "standby",
      });

      const res = await POST(buildRequest("https://example.com"), ctx(standby.id));
      expect(res.status).toBe(200);

      const rows = await prisma.credential.findMany({
        where: { ownerId: owner.id, kind: "ai" },
      });
      const activeOnes = rows.filter((r) => r.status === "active");
      expect(activeOnes).toHaveLength(1);
      expect(activeOnes[0].id).toBe(standby.id);

      const demoted = rows.find((r) => r.id === active.id);
      expect(demoted?.status).toBe("standby");
    });

    it("rejects activating a revoked credential", async () => {
      getSessionUser.mockResolvedValueOnce(admin);
      const { POST } = await import("../activate/route");
      const revoked = await createTestCredential(owner.id, { status: "revoked" });

      const res = await POST(buildRequest("https://example.com"), ctx(revoked.id));

      expect(res.status).toBe(400);
    });

    it("returns 404 for a non-admin caller", async () => {
      getSessionUser.mockResolvedValueOnce(owner);
      const { POST } = await import("../activate/route");
      const cred = await createTestCredential(owner.id, { status: "standby" });

      const res = await POST(buildRequest("https://example.com"), ctx(cred.id));

      expect(res.status).toBe(404);
    });
  });

  describe("POST /revoke", () => {
    it("revokes an unreferenced credential", async () => {
      getSessionUser.mockResolvedValueOnce(admin);
      const { POST } = await import("../revoke/route");
      const cred = await createTestCredential(owner.id);

      const res = await POST(buildRequest("https://example.com"), ctx(cred.id));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.status).toBe("revoked");
    });

    it("returns 409 when referenced by a business", async () => {
      getSessionUser.mockResolvedValueOnce(admin);
      const { POST } = await import("../revoke/route");
      const cred = await createTestCredential(owner.id, { kind: "ai" });
      const business = await createTestBusiness(owner.id, "revoke-ref");
      await prisma.business.update({
        where: { id: business.id },
        data: { aiCredentialId: cred.id },
      });

      const res = await POST(buildRequest("https://example.com"), ctx(cred.id));
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body.error).toContain(business.name);

      await prisma.business.update({
        where: { id: business.id },
        data: { aiCredentialId: null },
      });
    });
  });

  describe("DELETE /", () => {
    it("refuses to delete a non-revoked credential", async () => {
      getSessionUser.mockResolvedValueOnce(admin);
      const { DELETE } = await import("../route");
      const cred = await createTestCredential(owner.id, { status: "standby" });

      const res = await DELETE(buildRequest("https://example.com"), ctx(cred.id));

      expect(res.status).toBe(400);
    });

    it("deletes a revoked, unreferenced credential", async () => {
      getSessionUser.mockResolvedValueOnce(admin);
      const { DELETE } = await import("../route");
      const cred = await createTestCredential(owner.id, { status: "revoked" });

      const res = await DELETE(buildRequest("https://example.com"), ctx(cred.id));
      expect(res.status).toBe(200);

      const row = await prisma.credential.findUnique({ where: { id: cred.id } });
      expect(row).toBeNull();
    });

    it("returns 404 for a non-admin caller", async () => {
      getSessionUser.mockResolvedValueOnce(owner);
      const { DELETE } = await import("../route");
      const cred = await createTestCredential(owner.id, { status: "revoked" });

      const res = await DELETE(buildRequest("https://example.com"), ctx(cred.id));

      expect(res.status).toBe(404);
    });
  });
});
