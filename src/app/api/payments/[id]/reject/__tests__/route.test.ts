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
  return new NextRequest("https://example.com/api/payments/x/reject", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/payments/[id]/reject", () => {
  let owner: User;
  let business: Business & { phoneNumbers: { id: string }[] };
  let conversation: Conversation;

  const ownerIds: string[] = [];

  beforeAll(async () => {
    owner = await createTestUser("payments-reject-owner");
    ownerIds.push(owner.id);
    business = await createTestBusiness(owner.id, "reject-own");
    conversation = await createTestConversation(business.id, "reject-1");
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

  it("moves the session to rejected, writes an audit entry, and notifies the customer by default", async () => {
    const session = await createTestPaymentSession(
      business.id,
      conversation.id,
      conversation.customerPhone,
      { status: "ready_to_confirm" },
    );

    getSessionUser.mockResolvedValueOnce(owner);
    const { POST } = await import("../route");

    const res = await POST(buildRequest({ reason: "sospechoso" }), {
      params: Promise.resolve({ id: session.id }),
    });
    expect(res.status).toBe(200);

    const updated = await prisma.paymentSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(updated.status).toBe("rejected");

    const audit = await prisma.paymentAuditEntry.findFirst({
      where: { sessionId: session.id, action: "owner_rejected" },
    });
    expect((audit?.detail as { reason: string }).reason).toBe("sospechoso");
    expect(sendAndPersistReply).toHaveBeenCalledTimes(1);
  });

  it("skips customer notification when notifyCustomer is false", async () => {
    const session = await createTestPaymentSession(
      business.id,
      conversation.id,
      conversation.customerPhone,
      { status: "ready_to_confirm" },
    );

    getSessionUser.mockResolvedValueOnce(owner);
    const { POST } = await import("../route");

    const res = await POST(buildRequest({ notifyCustomer: false }), {
      params: Promise.resolve({ id: session.id }),
    });
    expect(res.status).toBe(200);
    expect(sendAndPersistReply).not.toHaveBeenCalled();
  });

  it("returns 409 when the session is not ready_to_confirm", async () => {
    const session = await createTestPaymentSession(
      business.id,
      conversation.id,
      conversation.customerPhone,
      { status: "escalated" },
    );

    getSessionUser.mockResolvedValueOnce(owner);
    const { POST } = await import("../route");

    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: session.id }),
    });
    expect(res.status).toBe(409);
  });
});
