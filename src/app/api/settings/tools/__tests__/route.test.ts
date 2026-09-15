import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/scope";
import {
  cleanupOwnershipFixtures,
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
  return new NextRequest("https://example.com/api/settings/tools", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("GET/PATCH /api/settings/tools", () => {
  let admin: User;
  let client: User;

  beforeAll(async () => {
    admin = await createTestUser("tools-settings-admin", "admin");
    client = await createTestUser("tools-settings-client");
  });

  afterAll(async () => {
    await prisma.appConfig.updateMany({
      where: { id: "default" },
      data: { toolsEnabled: false },
    });
    await cleanupOwnershipFixtures([admin.id, client.id]);
  });

  it("GET returns 404 for a non-admin caller", async () => {
    getSessionUser.mockResolvedValueOnce(client);
    const { GET } = await import("../route");

    const res = await GET();

    expect(res.status).toBe(404);
  });

  it("GET returns 404 when unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const { GET } = await import("../route");

    const res = await GET();

    expect(res.status).toBe(404);
  });

  it("GET upserts and returns the singleton row, off by default", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { GET } = await import("../route");

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ toolsEnabled: false });
  });

  it("PATCH returns 404 for a non-admin caller and does not flip the switch", async () => {
    getSessionUser.mockResolvedValueOnce(client);
    const { PATCH } = await import("../route");

    const res = await PATCH(buildPatch({ toolsEnabled: true }));

    expect(res.status).toBe(404);
    const stored = await prisma.appConfig.findUnique({
      where: { id: "default" },
    });
    expect(stored?.toolsEnabled).toBe(false);
  });

  it("PATCH turns the platform switch on for an admin caller", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { PATCH } = await import("../route");

    const res = await PATCH(buildPatch({ toolsEnabled: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.toolsEnabled).toBe(true);
    const stored = await prisma.appConfig.findUnique({
      where: { id: "default" },
    });
    expect(stored?.toolsEnabled).toBe(true);
  });

  it("PATCH rejects a non-boolean toolsEnabled", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { PATCH } = await import("../route");

    const res = await PATCH(buildPatch({ toolsEnabled: "yes" }));

    expect(res.status).toBe(400);
  });
});
