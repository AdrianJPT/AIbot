import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Business, Conversation, User } from "@prisma/client";
import {
  cleanupOwnershipFixtures,
  createTestBusiness,
  createTestConversation,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";

const getSessionUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  getSessionUser: () => getSessionUser(),
}));

function buildRequest(): NextRequest {
  return new NextRequest("https://example.com/api/conversations/x");
}

function buildPatch(body: unknown): NextRequest {
  return new NextRequest("https://example.com/api/conversations/x", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("GET /api/conversations/[id]", () => {
  let owner: User;
  let other: User;
  let business: Business;
  let conversation: Conversation;

  beforeAll(async () => {
    owner = await createTestUser("owner");
    other = await createTestUser("other");
    business = await createTestBusiness(owner.id, "conv-detail");
    conversation = await createTestConversation(business.id, "1");
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([owner.id, other.id]);
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const { GET } = await import("../route");

    const res = await GET(buildRequest(), {
      params: Promise.resolve({ id: conversation.id }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 404 when authenticated as a non-owner", async () => {
    getSessionUser.mockResolvedValueOnce(other);
    const { GET } = await import("../route");

    const res = await GET(buildRequest(), {
      params: Promise.resolve({ id: conversation.id }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 200 when authenticated as the owner", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET(buildRequest(), {
      params: Promise.resolve({ id: conversation.id }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe(conversation.id);
  });
});

describe("PATCH /api/conversations/[id]", () => {
  let owner: User;
  let other: User;
  let business: Business;
  let conversation: Conversation;

  beforeAll(async () => {
    owner = await createTestUser("owner-patch");
    other = await createTestUser("other-patch");
    business = await createTestBusiness(owner.id, "conv-patch");
    conversation = await createTestConversation(business.id, "patch-1");
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([owner.id, other.id]);
  });

  it("returns 404 when authenticated as a non-owner", async () => {
    getSessionUser.mockResolvedValueOnce(other);
    const { PATCH } = await import("../route");

    const res = await PATCH(buildPatch({ nickname: "Apodo" }), {
      params: Promise.resolve({ id: conversation.id }),
    });

    expect(res.status).toBe(404);
  });

  it("sets the nickname for the owner", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { PATCH } = await import("../route");

    const res = await PATCH(buildPatch({ nickname: "  Doña Rosa  " }), {
      params: Promise.resolve({ id: conversation.id }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.nickname).toBe("Doña Rosa");
  });

  it("clears the nickname when sent empty", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { PATCH } = await import("../route");

    const res = await PATCH(buildPatch({ nickname: "" }), {
      params: Promise.resolve({ id: conversation.id }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.nickname).toBeNull();
  });
});

describe("DELETE /api/conversations/[id]", () => {
  let owner: User;
  let other: User;
  let business: Business;

  beforeAll(async () => {
    owner = await createTestUser("owner-delete");
    other = await createTestUser("other-delete");
    business = await createTestBusiness(owner.id, "conv-delete");
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([owner.id, other.id]);
  });

  it("returns 404 when authenticated as a non-owner", async () => {
    const conversation = await createTestConversation(business.id, "delete-1");
    getSessionUser.mockResolvedValueOnce(other);
    const { DELETE } = await import("../route");

    const res = await DELETE(buildRequest(), {
      params: Promise.resolve({ id: conversation.id }),
    });

    expect(res.status).toBe(404);
  });

  it("deletes the conversation for the owner", async () => {
    const conversation = await createTestConversation(business.id, "delete-2");
    getSessionUser.mockResolvedValueOnce(owner);
    const { DELETE } = await import("../route");

    const res = await DELETE(buildRequest(), {
      params: Promise.resolve({ id: conversation.id }),
    });

    expect(res.status).toBe(200);
  });
});
