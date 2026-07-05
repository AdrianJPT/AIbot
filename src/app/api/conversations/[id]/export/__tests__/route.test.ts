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
  return new NextRequest("https://example.com/api/conversations/x/export");
}

describe("GET /api/conversations/[id]/export", () => {
  let owner: User;
  let other: User;
  let business: Business;
  let conversation: Conversation;

  beforeAll(async () => {
    owner = await createTestUser("export-owner");
    other = await createTestUser("export-other");
    business = await createTestBusiness(owner.id, "conv-export");
    conversation = await createTestConversation(business.id, "export-1");
    await prisma.message.createMany({
      data: [
        {
          conversationId: conversation.id,
          role: "user",
          content: "Hola, quiero info",
          sentBy: "customer",
        },
        {
          conversationId: conversation.id,
          role: "assistant",
          content: "Claro, ¿en qué te ayudo?",
          sentBy: "bot",
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { conversationId: conversation.id } });
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

  it("returns a chronological .txt transcript for the owner", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET(buildRequest(), {
      params: Promise.resolve({ id: conversation.id }),
    });
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const lines = text.trim().split("\n");
    expect(lines[0]).toContain("Cliente: Hola, quiero info");
    expect(lines[1]).toContain("Bot: Claro, ¿en qué te ayudo?");
  });
});
