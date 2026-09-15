import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Business, Conversation, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ChannelSendError } from "@/lib/channels/send-failure";
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

const sendFromNumber = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/whatsapp", () => ({
  sendFromNumber: (...args: unknown[]) => sendFromNumber(...args),
}));

function buildRequest(text = "hola"): NextRequest {
  return new NextRequest("https://example.com/api/conversations/x/send", {
    method: "POST",
    body: JSON.stringify({ text }),
    headers: { "content-type": "application/json" },
  });
}

function buildRetryRequest(retryOf: string): NextRequest {
  return new NextRequest("https://example.com/api/conversations/x/send", {
    method: "POST",
    body: JSON.stringify({ retryOf }),
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
    expect(sendFromNumber).not.toHaveBeenCalled();
  });

  it("returns 404 when authenticated as a non-owner", async () => {
    getSessionUser.mockResolvedValueOnce(other);
    const { POST } = await import("../route");

    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: conversation.id }),
    });

    expect(res.status).toBe(404);
    expect(sendFromNumber).not.toHaveBeenCalled();
  });

  it("returns 200 and persists the message when authenticated as the owner", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { POST } = await import("../route");

    const res = await POST(buildRequest("hola desde el owner"), {
      params: Promise.resolve({ id: conversation.id }),
    });
    const msg = await res.json();

    expect(res.status).toBe(200);
    expect(sendFromNumber).toHaveBeenCalled();
    expect(msg.content).toBe("hola desde el owner");
    expect(msg.sentBy).toBe("human");

    const updated = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
    });
    expect(updated.lastMessageAt.getTime()).toBeGreaterThan(
      conversation.lastMessageAt.getTime(),
    );
    expect(updated.unreadCount).toBe(conversation.unreadCount);

    await prisma.message.delete({ where: { id: msg.id } });
  });

  it("persists the classified failureCode/failureDetail on a window_expired send failure before the response returns", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    sendFromNumber.mockRejectedValueOnce(
      new ChannelSendError(
        "WhatsApp send failed: Request failed with status code 400",
        {
          code: "window_expired",
          detail: "131047 Re-engagement message: 24 hour window expired",
        },
      ),
    );
    const { POST } = await import("../route");

    const res = await POST(buildRequest("mensaje tardío"), {
      params: Promise.resolve({ id: conversation.id }),
    });
    const msg = await res.json();

    expect(res.status).toBe(200);
    expect(msg.status).toBe("failed");
    expect(msg.failureCode).toBe("window_expired");
    expect(msg.failureDetail).toBe(
      "131047 Re-engagement message: 24 hour window expired",
    );

    const persisted = await prisma.message.findUniqueOrThrow({
      where: { id: msg.id },
    });
    expect(persisted.status).toBe("failed");
    expect(persisted.failureCode).toBe("window_expired");
    expect(persisted.failureDetail).toBe(
      "131047 Re-engagement message: 24 hour window expired",
    );

    await prisma.message.delete({ where: { id: msg.id } });
  });

  it('retries a failed bot-origin message: persists a new Message row with sentBy:"bot" and the original content', async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const original = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: "respuesta original del bot",
        sentBy: "bot",
        status: "failed",
        failureCode: "auth",
        failureDetail: "credencial inválida",
      },
    });
    const { POST } = await import("../route");

    const res = await POST(buildRetryRequest(original.id), {
      params: Promise.resolve({ id: conversation.id }),
    });
    const retried = await res.json();

    expect(res.status).toBe(200);
    expect(retried.sentBy).toBe("bot");
    expect(retried.content).toBe("respuesta original del bot");
    expect(retried.status).toBe("sent");
    expect(sendFromNumber).toHaveBeenCalled();

    await prisma.message.deleteMany({
      where: { id: { in: [original.id, retried.id] } },
    });
  });

  it("returns 404 and sends nothing when retryOf points at another tenant's conversation", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const otherBusiness = await createTestBusiness(other.id, "conv-send-other");
    const otherConversation = await createTestConversation(
      otherBusiness.id,
      "9",
    );
    const foreignMessage = await prisma.message.create({
      data: {
        conversationId: otherConversation.id,
        role: "assistant",
        content: "respuesta de otro tenant",
        sentBy: "bot",
        status: "failed",
        failureCode: "auth",
      },
    });
    const { POST } = await import("../route");
    const callsBefore = sendFromNumber.mock.calls.length;

    const res = await POST(buildRetryRequest(foreignMessage.id), {
      params: Promise.resolve({ id: conversation.id }),
    });

    expect(res.status).toBe(404);
    expect(sendFromNumber.mock.calls.length).toBe(callsBefore);

    // Cascades otherConversation + foreignMessage.
    await prisma.business.delete({ where: { id: otherBusiness.id } });
  });

  it("returns 409 and sends nothing when retryOf points at a window_expired failed message", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const original = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: "mensaje expirado",
        sentBy: "bot",
        status: "failed",
        failureCode: "window_expired",
        failureDetail: "131047 Re-engagement message: 24 hour window expired",
      },
    });
    const { POST } = await import("../route");
    const callsBefore = sendFromNumber.mock.calls.length;

    const res = await POST(buildRetryRequest(original.id), {
      params: Promise.resolve({ id: conversation.id }),
    });

    expect(res.status).toBe(409);
    expect(sendFromNumber.mock.calls.length).toBe(callsBefore);

    await prisma.message.delete({ where: { id: original.id } });
  });

  it("returns 409 and sends nothing when retryOf points at a non-failed message", async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const original = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: "mensaje ya enviado",
        sentBy: "bot",
        status: "sent",
      },
    });
    const { POST } = await import("../route");
    const callsBefore = sendFromNumber.mock.calls.length;

    const res = await POST(buildRetryRequest(original.id), {
      params: Promise.resolve({ id: conversation.id }),
    });

    expect(res.status).toBe(409);
    expect(sendFromNumber.mock.calls.length).toBe(callsBefore);

    await prisma.message.delete({ where: { id: original.id } });
  });

  it('persists sentBy:"human" via the composer path when no retryOf is provided (characterization: composer path unchanged)', async () => {
    getSessionUser.mockResolvedValueOnce(owner);
    const { POST } = await import("../route");

    const res = await POST(buildRequest("mensaje del composer sin retryOf"), {
      params: Promise.resolve({ id: conversation.id }),
    });
    const msg = await res.json();

    expect(res.status).toBe(200);
    expect(msg.sentBy).toBe("human");
    expect(msg.content).toBe("mensaje del composer sin retryOf");

    await prisma.message.delete({ where: { id: msg.id } });
  });

  it("increases the daily bot-reply budget count by exactly one when a bot-origin retry succeeds (characterization: never double-counted)", async () => {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const original = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: "respuesta original que falló por rate limit",
        sentBy: "bot",
        status: "failed",
        failureCode: "rate_limit",
        failureDetail: "429 Too Many Requests",
      },
    });

    const countBefore = await prisma.message.count({
      where: {
        sentBy: "bot",
        createdAt: { gte: startOfDay },
        conversation: { businessId: business.id },
      },
    });

    getSessionUser.mockResolvedValueOnce(owner);
    const { POST } = await import("../route");
    const res = await POST(buildRetryRequest(original.id), {
      params: Promise.resolve({ id: conversation.id }),
    });
    const retried = await res.json();
    expect(res.status).toBe(200);

    const countAfter = await prisma.message.count({
      where: {
        sentBy: "bot",
        createdAt: { gte: startOfDay },
        conversation: { businessId: business.id },
      },
    });

    expect(countAfter).toBe(countBefore + 1);

    await prisma.message.deleteMany({
      where: { id: { in: [original.id, retried.id] } },
    });
  });
});
