import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
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

function buildRequest(url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method: "PATCH",
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

  describe("DELETE /", () => {
    it("deletes an unreferenced credential", async () => {
      getSessionUser.mockResolvedValueOnce(admin);
      const { DELETE } = await import("../route");
      const cred = await createTestCredential(owner.id);

      const res = await DELETE(buildRequest("https://example.com"), ctx(cred.id));
      expect(res.status).toBe(200);

      const row = await prisma.credential.findUnique({ where: { id: cred.id } });
      expect(row).toBeNull();
    });

    it("returns 409 when referenced by Business.aiCredentialId", async () => {
      getSessionUser.mockResolvedValueOnce(admin);
      const { DELETE } = await import("../route");
      const cred = await createTestCredential(owner.id, { kind: "ai" });
      const business = await createTestBusiness(owner.id, "delete-ref-ai");
      await prisma.business.update({
        where: { id: business.id },
        data: { aiCredentialId: cred.id },
      });

      const res = await DELETE(buildRequest("https://example.com"), ctx(cred.id));
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body.error).toContain(business.name);

      await prisma.business.update({
        where: { id: business.id },
        data: { aiCredentialId: null },
      });
    });

    it("returns 409 when referenced by PhoneNumber.whatsappCredentialId", async () => {
      getSessionUser.mockResolvedValueOnce(admin);
      const { DELETE } = await import("../route");
      const cred = await createTestCredential(owner.id, { kind: "whatsapp" });
      const business = await createTestBusiness(owner.id, "delete-ref-wa");
      await prisma.phoneNumber.update({
        where: { id: business.phoneNumbers[0].id },
        data: { whatsappCredentialId: cred.id },
      });

      const res = await DELETE(buildRequest("https://example.com"), ctx(cred.id));
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body.error).toContain(business.name);
    });

    it("returns 409 when it's the AppConfig default WhatsApp credential", async () => {
      getSessionUser.mockResolvedValueOnce(admin);
      const { DELETE } = await import("../route");
      const cred = await createTestCredential(owner.id, { kind: "whatsapp" });
      await prisma.appConfig.upsert({
        where: { id: "default" },
        update: { whatsappCredentialId: cred.id },
        create: { id: "default", whatsappCredentialId: cred.id },
      });

      const res = await DELETE(buildRequest("https://example.com"), ctx(cred.id));
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body.error).toMatch(/por defecto/);

      await prisma.appConfig.update({
        where: { id: "default" },
        data: { whatsappCredentialId: null },
      });
    });

    it("returns 404 for a non-admin caller", async () => {
      getSessionUser.mockResolvedValueOnce(owner);
      const { DELETE } = await import("../route");
      const cred = await createTestCredential(owner.id);

      const res = await DELETE(buildRequest("https://example.com"), ctx(cred.id));

      expect(res.status).toBe(404);
    });

    it("returns 404 when the credential doesn't exist", async () => {
      getSessionUser.mockResolvedValueOnce(admin);
      const { DELETE } = await import("../route");

      const res = await DELETE(buildRequest("https://example.com"), ctx("nonexistent"));

      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /", () => {
    it("updates the label", async () => {
      getSessionUser.mockResolvedValueOnce(admin);
      const { PATCH } = await import("../route");
      const cred = await createTestCredential(owner.id, { label: "Old label" });

      const res = await PATCH(
        buildRequest("https://example.com", { label: "New label" }),
        ctx(cred.id)
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.label).toBe("New label");

      const row = await prisma.credential.findUniqueOrThrow({ where: { id: cred.id } });
      expect(row.label).toBe("New label");
    });

    it("re-encrypts the key and updates keyLast4", async () => {
      getSessionUser.mockResolvedValueOnce(admin);
      const { PATCH } = await import("../route");
      const cred = await createTestCredential(owner.id, { key: "sk-old-0000" });

      const res = await PATCH(
        buildRequest("https://example.com", { key: "sk-new-9999" }),
        ctx(cred.id)
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.keyLast4).toBe("9999");

      const row = await prisma.credential.findUniqueOrThrow({ where: { id: cred.id } });
      expect(row.keyLast4).toBe("9999");
      expect(decryptSecret(row.encryptedKey)).toBe("sk-new-9999");
    });

    it("updates isActive", async () => {
      getSessionUser.mockResolvedValueOnce(admin);
      const { PATCH } = await import("../route");
      const cred = await createTestCredential(owner.id, { kind: "ai", isActive: true });

      const res = await PATCH(
        buildRequest("https://example.com", { isActive: false }),
        ctx(cred.id)
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.isActive).toBe(false);

      const row = await prisma.credential.findUniqueOrThrow({ where: { id: cred.id } });
      expect(row.isActive).toBe(false);
    });

    it("rejects clearing baseUrl to empty on a custom-provider credential", async () => {
      getSessionUser.mockResolvedValueOnce(admin);
      const { PATCH } = await import("../route");
      const cred = await createTestCredential(owner.id, {
        kind: "ai",
        provider: "custom",
        baseUrl: "https://api.example.com/v1",
      });

      const res = await PATCH(
        buildRequest("https://example.com", { baseUrl: "" }),
        ctx(cred.id)
      );

      expect(res.status).toBe(400);
    });

    it("reorders two credentials via two PATCH calls that swap priority", async () => {
      getSessionUser.mockResolvedValueOnce(admin);
      getSessionUser.mockResolvedValueOnce(admin);
      const { PATCH } = await import("../route");
      const first = await createTestCredential(owner.id, { kind: "ai", priority: 0 });
      const second = await createTestCredential(owner.id, { kind: "ai", priority: 1 });

      await PATCH(
        buildRequest("https://example.com", { priority: second.priority }),
        ctx(first.id)
      );
      await PATCH(
        buildRequest("https://example.com", { priority: first.priority }),
        ctx(second.id)
      );

      const rows = await prisma.credential.findMany({
        where: { id: { in: [first.id, second.id] } },
      });
      const byId = Object.fromEntries(rows.map((r) => [r.id, r.priority]));
      expect(byId[first.id]).toBe(1);
      expect(byId[second.id]).toBe(0);
    });

    it("ignores baseUrl for whatsapp credentials", async () => {
      getSessionUser.mockResolvedValueOnce(admin);
      const { PATCH } = await import("../route");
      const cred = await createTestCredential(owner.id, { kind: "whatsapp" });

      await PATCH(
        buildRequest("https://example.com", { baseUrl: "https://example.com" }),
        ctx(cred.id)
      );

      const row = await prisma.credential.findUniqueOrThrow({ where: { id: cred.id } });
      expect(row.baseUrl).toBeNull();
    });

    it("returns 404 for a non-admin caller", async () => {
      getSessionUser.mockResolvedValueOnce(owner);
      const { PATCH } = await import("../route");
      const cred = await createTestCredential(owner.id);

      const res = await PATCH(
        buildRequest("https://example.com", { label: "x" }),
        ctx(cred.id)
      );

      expect(res.status).toBe(404);
    });

    it("returns 404 when the credential doesn't exist", async () => {
      getSessionUser.mockResolvedValueOnce(admin);
      const { PATCH } = await import("../route");

      const res = await PATCH(
        buildRequest("https://example.com", { label: "x" }),
        ctx("nonexistent")
      );

      expect(res.status).toBe(404);
    });
  });
});
