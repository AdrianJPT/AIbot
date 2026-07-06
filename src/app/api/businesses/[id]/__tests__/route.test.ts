import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Business, User } from "@prisma/client";
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

function buildPatch(body: unknown): NextRequest {
  return new NextRequest("https://example.com/api/businesses/x", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("PATCH/DELETE /api/businesses/[id]", () => {
  let owner: User;
  let admin: User;
  let business: Business;

  beforeAll(async () => {
    owner = await createTestUser("biz-id-owner");
    admin = await createTestUser("biz-id-admin", "admin");
    business = await createTestBusiness(owner.id, "id-route");
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([owner.id, admin.id]);
  });

  it("PATCH returns 404 for a non-admin caller", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { PATCH } = await import("../route");

    const res = await PATCH(buildPatch({ name: "Nuevo nombre" }), {
      params: Promise.resolve({ id: business.id }),
    });

    expect(res.status).toBe(404);
  });

  it("PATCH updates displayPhone/visionModel/audioModel for an admin caller", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { PATCH } = await import("../route");

    const res = await PATCH(
      buildPatch({
        displayPhone: "+54 9 11 1234-5678",
        visionModel: "gpt-4o",
        audioModel: "whisper-1",
      }),
      { params: Promise.resolve({ id: business.id }) }
    );
    const updated = await res.json();

    expect(res.status).toBe(200);
    expect(updated.displayPhone).toBe("+54 9 11 1234-5678");
    expect(updated.visionModel).toBe("gpt-4o");
  });

  it("PATCH returns 409 with a friendly message on a duplicate phoneNumberId", async () => {
    const other = await createTestBusiness(owner.id, "id-route-other");
    getSessionUser.mockResolvedValueOnce(admin);
    const { PATCH } = await import("../route");

    const res = await PATCH(buildPatch({ phoneNumberId: other.phoneNumbers[0].phoneNumberId }), {
      params: Promise.resolve({ id: business.id }),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/ya está registrado/);
  });

  it("DELETE returns 404 for a non-admin caller", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { DELETE } = await import("../route");

    const res = await DELETE(new NextRequest("https://example.com/api/businesses/x"), {
      params: Promise.resolve({ id: business.id }),
    });

    expect(res.status).toBe(404);
  });
});
