import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Business, Conversation, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  cleanupOwnershipFixtures,
  createTestBusiness,
  createTestConversation,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";
import { createTestPaymentSession } from "@/lib/__tests__/fixtures/payments";

const getSessionUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  getSessionUser: () => getSessionUser(),
}));

const sendAndPersistReply = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/message-handler", () => ({
  sendAndPersistReply: (...args: unknown[]) => sendAndPersistReply(...args),
}));

function buildRequest(body: unknown = {}): NextRequest {
  return new NextRequest("https://example.com/api/payments/x/confirm", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/payments/[id]/confirm", () => {
  let owner: User;
  let other: User;
  let business: Business & { phoneNumbers: { id: string }[] };
  let conversation: Conversation;

  const ownerIds: string[] = [];

  beforeAll(async () => {
    owner = await createTestUser("payments-confirm-owner");
    other = await createTestUser("payments-confirm-other");
    ownerIds.push(owner.id, other.id);
    business = await createTestBusiness(owner.id, "confirm-own");
    conversation = await createTestConversation(business.id, "confirm-1");
  });

  beforeEach(() => {
    sendAndPersistReply.mockClear();
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures(ownerIds);
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const { POST } = await import("../route");

    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for a session owned by another tenant", async () => {
    const session = await createTestPaymentSession(
      business.id,
      conversation.id,
      conversation.customerPhone,
      { status: "ready_to_confirm" },
    );

    getSessionUser.mockResolvedValueOnce(other);
    const { POST } = await import("../route");

    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: session.id }),
    });
    expect(res.status).toBe(404);
  });

  it("moves a valid session to confirmed, sets confirmedById/At, writes audit entries, and notifies the customer", async () => {
    const session = await createTestPaymentSession(
      business.id,
      conversation.id,
      conversation.customerPhone,
      { status: "ready_to_confirm" },
    );

    getSessionUser.mockResolvedValueOnce(owner);
    const { POST } = await import("../route");

    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: session.id }),
    });
    expect(res.status).toBe(200);

    const updated = await prisma.paymentSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(updated.status).toBe("confirmed");
    expect(updated.confirmedById).toBe(owner.id);
    expect(updated.confirmedAt).not.toBeNull();

    const audit = await prisma.paymentAuditEntry.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.map((a) => a.action)).toEqual([
      "owner_confirmed",
      "transition:ready_to_confirm->confirmed",
    ]);
    expect(sendAndPersistReply).toHaveBeenCalledTimes(1);
  });

  it("rejects a plain confirm on a partial session (hold-until-complete default)", async () => {
    const session = await createTestPaymentSession(
      business.id,
      conversation.id,
      conversation.customerPhone,
      { status: "ready_to_confirm", statusReason: "partial" },
    );

    getSessionUser.mockResolvedValueOnce(owner);
    const { POST } = await import("../route");

    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: session.id }),
    });
    expect(res.status).toBe(409);

    const unchanged = await prisma.paymentSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(unchanged.status).toBe("ready_to_confirm");
  });

  it("allows the explicit partial override to force-confirm and records an override audit entry", async () => {
    const session = await createTestPaymentSession(
      business.id,
      conversation.id,
      conversation.customerPhone,
      { status: "ready_to_confirm", statusReason: "partial" },
    );

    getSessionUser.mockResolvedValueOnce(owner);
    const { POST } = await import("../route");

    const res = await POST(buildRequest({ partial: true }), {
      params: Promise.resolve({ id: session.id }),
    });
    expect(res.status).toBe(200);

    const updated = await prisma.paymentSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(updated.status).toBe("confirmed");

    const audit = await prisma.paymentAuditEntry.findFirst({
      where: { sessionId: session.id, action: "override" },
    });
    expect(audit).not.toBeNull();
    expect((audit?.detail as { partial: boolean }).partial).toBe(true);
  });

  it("returns 409 when the session is not ready_to_confirm", async () => {
    const session = await createTestPaymentSession(
      business.id,
      conversation.id,
      conversation.customerPhone,
      { status: "analyzing" },
    );

    getSessionUser.mockResolvedValueOnce(owner);
    const { POST } = await import("../route");

    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: session.id }),
    });
    expect(res.status).toBe(409);
  });
});
