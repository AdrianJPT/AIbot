import { notFound, redirect } from "next/navigation";
import { PaymentSessionStatus } from "@prisma/client";
import { ConversationThreadContainer } from "@/features/conversations/containers/conversation-thread-container";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { conversationScope } from "@/lib/scope";
import type { ConversationSummaryView } from "@/features/conversations/types";

const MESSAGES_PAGE_SIZE = 50;

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const conversation = await prisma.conversation.findFirst({
    where: { id, ...conversationScope(user) },
    include: { business: { select: { id: true, name: true } } },
  });
  if (!conversation) notFound();

  const page = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MESSAGES_PAGE_SIZE + 1,
    include: {
      paymentProofs: { select: { sessionId: true }, take: 1 },
    },
  });
  const hasMore = page.length > MESSAGES_PAGE_SIZE;
  const messages = hasMore ? page.slice(0, MESSAGES_PAGE_SIZE) : page;
  const nextCursor = hasMore ? messages[messages.length - 1].id : null;

  // "payments" handoff marker (design decision 7, tasks #568 PR4) — surfaces
  // when this conversation has a PaymentSession the AI escalated to the
  // owner, reusing HandoffToggle's visual pattern in the thread header.
  const escalatedPayment = await prisma.paymentSession.findFirst({
    where: { conversationId: id, status: PaymentSessionStatus.escalated },
    select: { id: true },
  });

  return (
    <ConversationThreadContainer
      conversation={{
        id: conversation.id,
        customerPhone: conversation.customerPhone,
        customerName: conversation.customerName,
        nickname: conversation.nickname,
        status: conversation.status,
        // Prisma types the column as Json, so it is cast to the loose view shape
        // rather than the server's validated ConversationSummary — the client
        // cannot import that validator (it reaches node:crypto through
        // prompt.ts), so SummaryPanel renders each field defensively instead.
        summary: conversation.summary as ConversationSummaryView | null,
        summarizedThroughAt:
          conversation.summarizedThroughAt?.toISOString() ?? null,
        business: conversation.business,
        hasEscalatedPayment: escalatedPayment !== null,
      }}
      initialMessages={{
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          mediaType: m.mediaType,
          sentBy: m.sentBy,
          status: m.status,
          createdAt: m.createdAt.toISOString(),
          paymentSessionId: m.paymentProofs[0]?.sessionId ?? null,
        })),
        nextCursor,
      }}
    />
  );
}
