import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Business, Conversation, User } from "@prisma/client";
import { prisma } from "@/lib/db";
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
  return new NextRequest("https://example.com/api/conversations/x/read", {
    method: "POST",
  });
}

describe("POST /api/conversations/[id]/read", () => {
  let owner: User;
  let other: User;
  let business: Business;
  let conversation: Conversation;

  beforeAll(async () => {
    owner = await createTestUser("owner");
    other = await createTestUser("other");
    business = await createTestBusiness(owner.id, "conv-read");
    conversation = await createTestConversation(business.id, "4");
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { unreadCount: 3 },
    });
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([owner.id, other.id]);
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const { POST } = await import("../route");

    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: conversation.id }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 404 when authenticated as a non-owner", async () => {
    getSessionUser.mockResolvedValueOnce(other);
    const { POST } = await import("../route");

    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: conversation.id }),
    });

    expect(res.status).toBe(404);
  });

  it("zeroes unreadCount when authenticated as the owner", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { POST } = await import("../route");

    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: conversation.id }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.unreadCount).toBe(0);
  });
});
