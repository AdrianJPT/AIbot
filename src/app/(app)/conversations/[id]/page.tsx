import { notFound, redirect } from "next/navigation";
import { ConversationThreadContainer } from "@/features/conversations/containers/conversation-thread-container";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { conversationScope } from "@/lib/scope";

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
  });
  const hasMore = page.length > MESSAGES_PAGE_SIZE;
  const messages = hasMore ? page.slice(0, MESSAGES_PAGE_SIZE) : page;
  const nextCursor = hasMore ? messages[messages.length - 1].id : null;

  return (
    <ConversationThreadContainer
      conversation={{
        id: conversation.id,
        customerPhone: conversation.customerPhone,
        customerName: conversation.customerName,
        status: conversation.status,
        business: conversation.business,
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
        })),
        nextCursor,
      }}
    />
  );
}
