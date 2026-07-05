import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConversationViewContainer } from "@/features/conversations/containers/conversation-view-container";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const c = await prisma.conversation.findFirst({
    where: { id, business: { ownerId: user.id } },
    include: {
      business: { select: { name: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!c) notFound();

  const initial = {
    id: c.id,
    customerPhone: c.customerPhone,
    status: c.status,
    business: c.business,
    messages: c.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      mediaType: m.mediaType,
      createdAt: m.createdAt.toISOString(),
    })),
  };

  return (
    <div>
      <Link
        href="/conversations"
        className="mb-4 inline-block text-muted-foreground hover:text-foreground"
      >
        ← Conversaciones
      </Link>
      <h1 className="mb-2 text-2xl font-bold">Chat · {c.customerPhone}</h1>
      <p className="mb-6 text-muted-foreground">{c.business.name}</p>
      <ConversationViewContainer
        key={`${c.id}-${c.messages.length}-${c.updatedAt.toISOString()}`}
        conversation={initial}
      />
    </div>
  );
}
