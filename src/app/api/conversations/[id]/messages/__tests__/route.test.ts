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

function buildRequest(
  conversationId: string,
  query: Record<string, string> = {}
): NextRequest {
  const url = new URL(
    `https://example.com/api/conversations/${conversationId}/messages`
  );
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return new NextRequest(url);
}

describe("GET /api/conversations/[id]/messages", () => {
  let owner: User;
  let other: User;
  let business: Business;
  let conversation: Conversation;

  beforeAll(async () => {
    owner = await createTestUser("owner");
    other = await createTestUser("other");
    business = await createTestBusiness(owner.id, "conv-messages");
    conversation = await createTestConversation(business.id, "5");

    // Insert 5 messages with strictly increasing createdAt so ordering is
    // deterministic across the (createdAt, id) desc cursor.
    for (let i = 0; i < 5; i++) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "user",
          content: `mensaje ${i}`,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
        },
      });
    }
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([owner.id, other.id]);
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const { GET } = await import("../route");

    const res = await GET(buildRequest(conversation.id), {
      params: Promise.resolve({ id: conversation.id }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 404 when authenticated as a non-owner", async () => {
    getSessionUser.mockResolvedValueOnce(other);
    const { GET } = await import("../route");

    const res = await GET(buildRequest(conversation.id), {
      params: Promise.resolve({ id: conversation.id }),
    });

    expect(res.status).toBe(404);
  });

  it("returns the newest page first, newest message first", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET(buildRequest(conversation.id, { limit: "2" }), {
      params: Promise.resolve({ id: conversation.id }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].content).toBe("mensaje 4");
    expect(body.messages[1].content).toBe("mensaje 3");
    expect(body.nextCursor).toBe(body.messages[1].id);
  });

  it("pages older messages via cursor without overlap or gaps", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const first = await (
      await GET(buildRequest(conversation.id, { limit: "2" }), {
        params: Promise.resolve({ id: conversation.id }),
      })
    ).json();

    getSessionUser.mockResolvedValueOnce(owner);
    const second = await (
      await GET(
        buildRequest(conversation.id, { limit: "2", cursor: first.nextCursor }),
        { params: Promise.resolve({ id: conversation.id }) }
      )
    ).json();

    expect(second.messages.map((m: { content: string }) => m.content)).toEqual([
      "mensaje 2",
      "mensaje 1",
    ]);
    expect(second.nextCursor).toBe(second.messages[1].id);

    getSessionUser.mockResolvedValueOnce(owner);
    const third = await (
      await GET(
        buildRequest(conversation.id, { limit: "2", cursor: second.nextCursor }),
        { params: Promise.resolve({ id: conversation.id }) }
      )
    ).json();

    expect(third.messages.map((m: { content: string }) => m.content)).toEqual([
      "mensaje 0",
    ]);
    expect(third.nextCursor).toBeNull();
  });
});
