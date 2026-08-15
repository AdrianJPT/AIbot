import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
  return new NextRequest("https://example.com/api/payments/x/media/y");
}

describe("GET /api/payments/[id]/media/[proofId]", () => {
  let owner: User;
  let other: User;
  let business: Business & { phoneNumbers: { id: string }[] };
  let conversation: Conversation;

  const ownerIds: string[] = [];

  beforeAll(async () => {
    owner = await createTestUser("payments-media-owner");
    other = await createTestUser("payments-media-other");
    ownerIds.push(owner.id, other.id);
    business = await createTestBusiness(owner.id, "media-own");
    conversation = await createTestConversation(business.id, "media-1");
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures(ownerIds);
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const { GET } = await import("../route");

    const res = await GET(buildRequest(), {
      params: Promise.resolve({ id: "x", proofId: "y" }),
    });
    expect(res.status).toBe(401);
  });

  it("serves the persisted proof bytes with the stored mime type for the owner", async () => {
    const session = await createTestPaymentSession(
      business.id,
      conversation.id,
      conversation.customerPhone,
    );
    const proof = await createTestPaymentProof(session.id, {
      mediaData: Buffer.from("hello-proof"),
      mediaMimeType: "image/png",
    });

    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET(buildRequest(), {
      params: Promise.resolve({ id: session.id, proofId: proof.id }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.toString()).toBe("hello-proof");
  });

  it("returns 404 for a session belonging to another tenant", async () => {
    const session = await createTestPaymentSession(
      business.id,
      conversation.id,
      conversation.customerPhone,
    );
    const proof = await createTestPaymentProof(session.id);

    getSessionUser.mockResolvedValueOnce(other);
    const { GET } = await import("../route");

    const res = await GET(buildRequest(), {
      params: Promise.resolve({ id: session.id, proofId: proof.id }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the proof has no persisted media", async () => {
    const session = await createTestPaymentSession(
      business.id,
      conversation.id,
      conversation.customerPhone,
    );
    const proof = await createTestPaymentProof(session.id, {
      mediaData: null,
      mediaMimeType: null,
    });

    getSessionUser.mockResolvedValueOnce(owner);
    const { GET } = await import("../route");

    const res = await GET(buildRequest(), {
      params: Promise.resolve({ id: session.id, proofId: proof.id }),
    });
    expect(res.status).toBe(404);
  });
});
