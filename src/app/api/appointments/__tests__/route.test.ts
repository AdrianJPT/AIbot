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

function buildRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.com/api/appointments", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/appointments", () => {
  let owner: User;
  let other: User;
  let ownBusiness: Business & { phoneNumbers: { id: string }[] };
  let foreignBusiness: Business & { phoneNumbers: { id: string }[] };
  let ownConversation: Conversation;
  let foreignConversation: Conversation;

  beforeAll(async () => {
    owner = await createTestUser("appt-post-owner");
    other = await createTestUser("appt-post-other");
    ownBusiness = await createTestBusiness(owner.id, "post-own");
    foreignBusiness = await createTestBusiness(other.id, "post-foreign");
    ownConversation = await createTestConversation(ownBusiness.id, "post-own-1");
    foreignConversation = await createTestConversation(
      foreignBusiness.id,
      "post-foreign-1",
    );
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([owner.id, other.id]);
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest({
        businessId: ownBusiness.id,
        customerPhone: "+5491100000000",
        customerName: "Cliente",
        service: "Corte",
        date: "2026-08-01",
        time: "10:00",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when a required field is missing", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest({
        businessId: ownBusiness.id,
        customerPhone: "+5491100000000",
        customerName: "Cliente",
        service: "Corte",
        date: "2026-08-01",
        // time missing
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when conversationId is non-string", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest({
        businessId: ownBusiness.id,
        conversationId: 12345,
        customerPhone: "+5491100000000",
        customerName: "Cliente",
        service: "Corte",
        date: "2026-08-01",
        time: "10:00",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when status is outside the allowlist", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest({
        businessId: ownBusiness.id,
        customerPhone: "+5491100000000",
        customerName: "Cliente",
        service: "Corte",
        date: "2026-08-01",
        time: "10:00",
        status: "completed",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when businessId belongs to another tenant", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest({
        businessId: foreignBusiness.id,
        customerPhone: "+5491100000000",
        customerName: "Cliente",
        service: "Corte",
        date: "2026-08-01",
        time: "10:00",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 and creates no row when conversationId belongs to another tenant", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest({
        businessId: ownBusiness.id,
        conversationId: foreignConversation.id,
        customerPhone: "+5491100000000",
        customerName: "Cliente",
        service: "Corte",
        date: "2026-08-01",
        time: "10:00",
      }),
    );
    expect(res.status).toBe(404);

    const count = await prisma.appointment.count({
      where: { conversationId: foreignConversation.id },
    });
    expect(count).toBe(0);
  });

  it("returns 201 on happy path with own businessId and conversationId", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { POST } = await import("../route");

    const res = await POST(
      buildRequest({
        businessId: ownBusiness.id,
        conversationId: ownConversation.id,
        customerPhone: "+5491100000000",
        customerName: "Cliente",
        service: "Corte",
        date: "2026-08-01",
        time: "10:00",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.businessId).toBe(ownBusiness.id);
    expect(body.conversationId).toBe(ownConversation.id);
    expect(body.status).toBe("pending");
  });
});
