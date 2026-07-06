import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

function buildPatch(body: unknown): NextRequest {
  return new NextRequest("https://example.com/api/settings/ai-defaults", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("GET/PATCH /api/settings/ai-defaults", () => {
  let admin: User;
  let client: User;

  beforeAll(async () => {
    admin = await createTestUser("ai-defaults-admin", "admin");
    client = await createTestUser("ai-defaults-client");
  });

  afterAll(async () => {
    await prisma.appConfig.deleteMany({ where: { id: "default" } });
    await cleanupOwnershipFixtures([admin.id, client.id]);
  });

  it("GET returns 404 for a non-admin caller", async () => {
    getSessionUser.mockResolvedValueOnce(client);
    const { GET } = await import("../route");

    const res = await GET();

    expect(res.status).toBe(404);
  });

  it("GET upserts and returns the singleton row with hardcoded defaults", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { GET } = await import("../route");

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      aiCredentialId: null,
      chatModel: "gpt-4o-mini",
      visionModel: "gpt-4o-mini",
      audioModel: "whisper-1",
    });
  });

  it("PATCH rejects a credential not owned by the admin", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { PATCH } = await import("../route");

    const res = await PATCH(
      buildPatch({
        aiCredentialId: "does-not-exist",
        chatModel: "gpt-4o-mini",
        visionModel: "gpt-4o-mini",
        audioModel: "whisper-1",
      })
    );

    expect(res.status).toBe(400);
  });

  it("PATCH updates the defaults for a valid admin-owned credential", async () => {
    const credential = await createTestCredential(admin.id, { kind: "ai" });
    getSessionUser.mockResolvedValueOnce(admin);
    const { PATCH } = await import("../route");

    const res = await PATCH(
      buildPatch({
        aiCredentialId: credential.id,
        chatModel: "gemini-2.0-flash",
        visionModel: "gemini-2.0-flash",
        audioModel: "whisper-1",
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.aiCredentialId).toBe(credential.id);
    expect(body.chatModel).toBe("gemini-2.0-flash");
  });
});
