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

const sendBusinessMessage = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/whatsapp", () => ({
  sendBusinessMessage: (...args: unknown[]) => sendBusinessMessage(...args),
}));

function buildRequest(text = "hola"): NextRequest {
  return new NextRequest("https://example.com/api/conversations/x/send", {
    method: "POST",
    body: JSON.stringify({ text }),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/conversations/[id]/send", () => {
  let owner: User;
  let other: User;
  let business: Business;
  let conversation: Conversation;

  beforeAll(async () => {
    owner = await createTestUser("owner");
    other = await createTestUser("other");
    business = await createTestBusiness(owner.id, "conv-send");
    conversation = await createTestConversation(business.id, "2");
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
    expect(sendBusinessMessage).not.toHaveBeenCalled();
  });

  it("returns 404 when authenticated as a non-owner", async () => {
    getSessionUser.mockResolvedValueOnce(other);
    const { POST } = await import("../route");

    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: conversation.id }),
    });

    expect(res.status).toBe(404);
    expect(sendBusinessMessage).not.toHaveBeenCalled();
  });

  it("returns 200 and persists the message when authenticated as the owner", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { POST } = await import("../route");

    const res = await POST(buildRequest("hola desde el owner"), {
      params: Promise.resolve({ id: conversation.id }),
    });
    const msg = await res.json();

    expect(res.status).toBe(200);
    expect(sendBusinessMessage).toHaveBeenCalled();
    expect(msg.content).toBe("hola desde el owner");

    await prisma.message.delete({ where: { id: msg.id } });
  });
});
