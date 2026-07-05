import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import {
  cleanupOwnershipFixtures,
  createTestCredential,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";

const getSessionUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  getSessionUser: () => getSessionUser(),
}));

function buildRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.com/api/credentials", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("GET/POST /api/credentials", () => {
  let owner: User;
  let other: User;

  beforeAll(async () => {
    owner = await createTestUser("cred-owner");
    other = await createTestUser("cred-other");
    await createTestCredential(owner.id, { label: "owned-by-owner" });
    await createTestCredential(other.id, { label: "owned-by-other" });
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([owner.id, other.id]);
  });

  it("GET returns 401 when unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const { GET } = await import("../route");

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it("GET returns only the caller's own credentials, without encryptedKey", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET();
    const list = await res.json();

    expect(res.status).toBe(200);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((c: { label: string }) => c.label !== "owned-by-other")).toBe(
      true
    );
    expect(list.every((c: Record<string, unknown>) => !("encryptedKey" in c))).toBe(
      true
    );
  });

  it("POST returns 401 when unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const { POST } = await import("../route");

    const res = await POST(buildRequest({}));

    expect(res.status).toBe(401);
  });

  it("POST returns 400 on missing fields", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { POST } = await import("../route");

    const res = await POST(buildRequest({ kind: "ai" }));

    expect(res.status).toBe(400);
  });

  it("POST creates an encrypted credential owned by the caller", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
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
    expect(row.ownerId).toBe(owner.id);
    expect(row.status).toBe("standby");
    expect(decryptSecret(row.encryptedKey)).toBe("sk-abcd1234");
  });
});
