import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
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
  return new NextRequest("https://example.com/api/conversations/x/summary", {
    method: "DELETE",
  });
}

const STORED_SUMMARY = {
  customerName: "Sofía",
  preferences: ["Celíaca"],
  commitments: [],
  openItems: ["Espera el precio del catering"],
  facts: [],
  notes: null,
};

describe("DELETE /api/conversations/[id]/summary", () => {
  let owner: User;
  let other: User;
  let business: Business;
  let conversation: Conversation;

  beforeAll(async () => {
    owner = await createTestUser("owner");
    other = await createTestUser("other");
    business = await createTestBusiness(owner.id, "conv-summary");
    conversation = await createTestConversation(business.id, "9");
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([owner.id, other.id]);
  });

  beforeEach(async () => {
    // Re-seed a summary before each case, so a passing delete cannot make a
    // later test pass for the wrong reason.
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        summary: STORED_SUMMARY,
        summarizedThroughAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const { DELETE } = await import("../route");

    const res = await DELETE(buildRequest(), {
      params: Promise.resolve({ id: conversation.id }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 404 when authenticated as a non-owner", async () => {
    getSessionUser.mockResolvedValueOnce(other);
    const { DELETE } = await import("../route");

    const res = await DELETE(buildRequest(), {
      params: Promise.resolve({ id: conversation.id }),
    });

    expect(res.status).toBe(404);
  });

  it("leaves the summary intact when the caller is out of scope", async () => {
    // A 404 that still wiped the row would be worse than a 403.
    getSessionUser.mockResolvedValueOnce(other);
    const { DELETE } = await import("../route");

    await DELETE(buildRequest(), {
      params: Promise.resolve({ id: conversation.id }),
    });

    const after = await prisma.conversation.findUnique({
      where: { id: conversation.id },
    });
    expect(after!.summary).toMatchObject({ customerName: "Sofía" });
    expect(after!.summarizedThroughAt).not.toBeNull();
  });

  it("returns 404 for a conversation that does not exist", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { DELETE } = await import("../route");

    const res = await DELETE(buildRequest(), {
      params: Promise.resolve({ id: "conv_does_not_exist" }),
    });

    expect(res.status).toBe(404);
  });

  it("nulls both the summary and its watermark for the owner", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { DELETE } = await import("../route");

    const res = await DELETE(buildRequest(), {
      params: Promise.resolve({ id: conversation.id }),
    });

    expect(res.status).toBe(200);

    const after = await prisma.conversation.findUnique({
      where: { id: conversation.id },
    });
    // Both, together. Clearing the summary while leaving the watermark would
    // leave the conversation with no memory AND a truncated history, which is
    // strictly worse than either — see the route's doc comment.
    expect(after!.summary).toBeNull();
    expect(after!.summarizedThroughAt).toBeNull();
  });

  it("stores a SQL NULL rather than the JSON value null", async () => {
    // Prisma.DbNull vs Prisma.JsonNull: the read path treats SQL NULL as "no
    // summary", and a stored JSON `null` would be a different value that
    // findFirst filters would not match the same way.
    getSessionUser.mockResolvedValueOnce(owner);
    const { DELETE } = await import("../route");

    await DELETE(buildRequest(), {
      params: Promise.resolve({ id: conversation.id }),
    });

    const rows = await prisma.$queryRaw<
      Array<{ is_sql_null: boolean }>
    >`SELECT "summary" IS NULL AS is_sql_null FROM "Conversation" WHERE id = ${conversation.id}`;
    expect(rows[0].is_sql_null).toBe(true);
  });

  it("is idempotent when there is no summary to clear", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { DELETE } = await import("../route");
    await DELETE(buildRequest(), {
      params: Promise.resolve({ id: conversation.id }),
    });

    getSessionUser.mockResolvedValueOnce(owner);
    const res = await DELETE(buildRequest(), {
      params: Promise.resolve({ id: conversation.id }),
    });

    expect(res.status).toBe(200);
  });

  it("does not touch the conversation's messages or status", async () => {
    const before = await prisma.conversation.findUnique({
      where: { id: conversation.id },
    });
    const messagesBefore = await prisma.message.count({
      where: { conversationId: conversation.id },
    });

    getSessionUser.mockResolvedValueOnce(owner);
    const { DELETE } = await import("../route");
    await DELETE(buildRequest(), {
      params: Promise.resolve({ id: conversation.id }),
    });

    const after = await prisma.conversation.findUnique({
      where: { id: conversation.id },
    });
    expect(after!.status).toBe(before!.status);
    expect(
      await prisma.message.count({
        where: { conversationId: conversation.id },
      }),
    ).toBe(messagesBefore);
  });
});
