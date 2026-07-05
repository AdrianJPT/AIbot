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
  return new NextRequest("https://example.com/api/conversations/x/appointments");
}

describe("GET /api/conversations/[id]/appointments", () => {
  let owner: User;
  let other: User;
  let business: Business;
  let conversation: Conversation;

  beforeAll(async () => {
    owner = await createTestUser("appt-owner");
    other = await createTestUser("appt-other");
    business = await createTestBusiness(owner.id, "conv-appts");
    conversation = await createTestConversation(business.id, "appts-1");
    await prisma.appointment.create({
      data: {
        businessId: business.id,
        conversationId: conversation.id,
        customerPhone: conversation.customerPhone,
        customerName: "Cliente Test",
        service: "Corte de pelo",
        date: "2026-08-01",
        time: "10:00",
      },
    });
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { conversationId: conversation.id } });
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

  it("returns the conversation's appointments for the owner", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET(buildRequest(), {
      params: Promise.resolve({ id: conversation.id }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].service).toBe("Corte de pelo");
  });
});
