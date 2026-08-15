import { afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Business, Conversation, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  cleanupOwnershipFixtures,
  createTestBusiness,
  createTestConversation,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";
import {
  createTestPaymentProof,
  createTestPaymentSession,
} from "@/lib/__tests__/fixtures/payments";

const getSessionUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  getSessionUser: () => getSessionUser(),
}));

function buildRequest(): NextRequest {
  return new NextRequest("https://example.com/api/payments/x");
}

describe("GET /api/payments/[id]", () => {
  let owner: User;
  let other: User;
  let business: Business & { phoneNumbers: { id: string }[] };
  let conversation: Conversation;

  const ownerIds: string[] = [];

  afterAll(async () => {
    await cleanupOwnershipFixtures(ownerIds);
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const { GET } = await import("../route");

    const res = await GET(buildRequest(), {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for a foreign-tenant session, and detail + audit trail for the owner", async () => {
    owner = await createTestUser("payments-detail-owner");
    other = await createTestUser("payments-detail-other");
    ownerIds.push(owner.id, other.id);

    business = await createTestBusiness(owner.id, "detail-own");
    conversation = await createTestConversation(business.id, "detail-1");

    const session = await createTestPaymentSession(
      business.id,
      conversation.id,
      conversation.customerPhone,
      { status: "ready_to_confirm", expectedAmount: 10000 },
    );
    const proof = await createTestPaymentProof(session.id, {
      verdict: "valid",
      amount: 10000,
    });
    await prisma.paymentAuditEntry.create({
      data: {
        sessionId: session.id,
        actor: "ai",
        action: "proof_received",
        detail: { proofId: proof.id },
      },
    });

    getSessionUser.mockResolvedValueOnce(other);
    const { GET } = await import("../route");

    const foreignRes = await GET(buildRequest(), {
      params: Promise.resolve({ id: session.id }),
    });
    expect(foreignRes.status).toBe(404);

    getSessionUser.mockResolvedValueOnce(owner);
    const res = await GET(buildRequest(), {
      params: Promise.resolve({ id: session.id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.id).toBe(session.id);
    expect(body.proofs).toHaveLength(1);
    expect(body.proofs[0].id).toBe(proof.id);
    expect(body.auditEntries).toHaveLength(1);
    expect(body.auditEntries[0].action).toBe("proof_received");
  });
});
