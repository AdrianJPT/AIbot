import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Business, Conversation, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  cleanupOwnershipFixtures,
  createTestBusiness,
  createTestConversation,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";
import {
  dateSeparatorLabel,
  initialsFrom,
} from "@/features/conversations/lib/format";

// Prod has exactly this shape: nickname null, customerName null (WhatsApp
// never sent a profile name), 6 text messages, bot replies with
// status "failed". Opening this conversation in prod renders a server
// error page (error digest, zero Postgres errors logged) — this test seeds
// the same shape locally and calls the page function directly to see
// whether it reproduces.
const getSessionUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  getSessionUser: () => getSessionUser(),
}));

// `notFound`/`redirect` throw a special NEXT_HTTP_ERROR_FALLBACK/
// NEXT_REDIRECT signal outside of a real Next.js request — mock them so a
// call that *should* reach them fails loudly with a distinguishable error
// instead of an opaque Next.js internal error.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

describe("ConversationDetailPage (prod-shaped data)", () => {
  let admin: User;
  let business: Business;
  let conversation: Conversation;

  beforeAll(async () => {
    admin = await createTestUser("conv-page-admin", "admin");
    business = await createTestBusiness(admin.id, "conv-page");
    conversation = await createTestConversation(business.id, "prod-shape");

    // Prod: nickname null, customerName null.
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { customerName: null, nickname: null },
    });

    // 6 text messages, mixing sentBy, with bot rows marked "failed" — the
    // exact shape reported in prod.
    const rows: Array<{
      role: string;
      content: string;
      sentBy: string;
      status: string;
    }> = [
      { role: "user", content: "Hola, quería consultar", sentBy: "customer", status: "sent" },
      { role: "assistant", content: "Hola! Decime en qué te ayudo", sentBy: "bot", status: "failed" },
      { role: "user", content: "Quiero un turno para mañana", sentBy: "customer", status: "sent" },
      { role: "assistant", content: "Perfecto, te confirmo enseguida", sentBy: "bot", status: "failed" },
      { role: "assistant", content: "Ya te anoté para mañana a las 10", sentBy: "human", status: "sent" },
      { role: "user", content: "Gracias!", sentBy: "customer", status: "sent" },
    ];
    for (let i = 0; i < rows.length; i++) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: rows[i].role,
          content: rows[i].content,
          sentBy: rows[i].sentBy,
          status: rows[i].status,
          mediaType: "text",
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
        },
      });
    }
  });

  afterAll(async () => {
    await cleanupOwnershipFixtures([admin.id]);
  });

  it("resolves without throwing and returns the expected element tree", async () => {
    getSessionUser.mockResolvedValueOnce(admin);
    const { default: ConversationDetailPage } = await import("../page");

    // The page is an async server component. Calling it directly (rather
    // than rendering through React) executes its body — including every
    // Prisma call and null-guard branch — without invoking the child
    // client component's own function body, since JSX element creation
    // does not call the component function.
    const element = await ConversationDetailPage({
      params: Promise.resolve({ id: conversation.id }),
    });

    expect(element).toBeTruthy();
    expect(element.props.conversation).toMatchObject({
      id: conversation.id,
      customerName: null,
      nickname: null,
      status: "active",
    });
    expect(element.props.initialMessages.messages).toHaveLength(6);
    // Newest-first ordering (createdAt desc): the last-seeded message
    // ("Gracias!") comes first.
    expect(element.props.initialMessages.messages[0].content).toBe("Gracias!");
    expect(
      element.props.initialMessages.messages.some(
        (m: { sentBy: string; status: string }) =>
          m.sentBy === "bot" && m.status === "failed"
      )
    ).toBe(true);
    expect(element.props.initialMessages.nextCursor).toBeNull();
  });
});

describe("format helpers with prod-shaped edge inputs", () => {
  it("initialsFrom falls back to the phone suffix when name is null", () => {
    expect(initialsFrom(null, "+5491122334455")).toBe("55");
    expect(initialsFrom(undefined, "+5491122334455")).toBe("55");
    expect(initialsFrom("", "+5491122334455")).toBe("55");
  });

  it("dateSeparatorLabel handles a plain Date and an ISO string the same way", () => {
    const now = new Date();
    expect(dateSeparatorLabel(now)).toBe("Hoy");
    expect(dateSeparatorLabel(now.toISOString())).toBe("Hoy");
  });
});
