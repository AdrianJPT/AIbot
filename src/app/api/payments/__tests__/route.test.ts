import { afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Business, Conversation, User } from "@prisma/client";
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
  return new NextRequest("https://example.com/api/payments");
}

describe("GET /api/payments", () => {
  let owner: User;
  let other: User;
  let ownBusiness: Business & { phoneNumbers: { id: string }[] };
  let foreignBusiness: Business & { phoneNumbers: { id: string }[] };
  let ownConversation: Conversation;
  let foreignConversation: Conversation;

  const ownerIds: string[] = [];

  afterAll(async () => {
    await cleanupOwnershipFixtures(ownerIds);
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const { GET } = await import("../route");

    const res = await GET(buildRequest());
    expect(res.status).toBe(401);
  });

  it("only lists ready_to_confirm sessions scoped to the caller's businesses", async () => {
    owner = await createTestUser("payments-inbox-owner");
    other = await createTestUser("payments-inbox-other");
    ownerIds.push(owner.id, other.id);

    ownBusiness = await createTestBusiness(owner.id, "inbox-own");
    foreignBusiness = await createTestBusiness(other.id, "inbox-foreign");
    ownConversation = await createTestConversation(ownBusiness.id, "inbox-1");
    foreignConversation = await createTestConversation(
      foreignBusiness.id,
      "inbox-2",
    );

    const readySession = await createTestPaymentSession(
      ownBusiness.id,
      ownConversation.id,
      ownConversation.customerPhone,
      { status: "ready_to_confirm", expectedAmount: 20000 },
    );
    await createTestPaymentProof(readySession.id, {
      verdict: "needs_attention",
      amount: 15000,
    });

    // Not ready_to_confirm — must not appear.
    await createTestPaymentSession(
      ownBusiness.id,
      ownConversation.id,
      ownConversation.customerPhone,
      { status: "analyzing" },
    );

    // Belongs to another tenant — must not appear for `owner`.
    const foreignSession = await createTestPaymentSession(
      foreignBusiness.id,
      foreignConversation.id,
      foreignConversation.customerPhone,
      { status: "ready_to_confirm" },
    );
    await createTestPaymentProof(foreignSession.id);

    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET(buildRequest());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(readySession.id);
    expect(body[0].status).toBe("ready_to_confirm");
    expect(body[0].expectedAmount).toBe(20000);
    expect(body[0].receivedAmount).toBe(15000);
    expect(body[0].remaining).toBe(5000);
    expect(body[0].latestProof.verdict).toBe("needs_attention");
  });
});
