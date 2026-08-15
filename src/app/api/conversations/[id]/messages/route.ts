import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { conversationScope } from "@/lib/scope";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Cursor-paginated message history for a conversation, ordered by
 * (createdAt, id) desc — newest first, matching how the chat thread loads
 * its latest page and then pages older messages on scroll-top.
 *
 * `cursor` is a message id. When present, results start strictly after
 * that message in the (createdAt desc, id desc) ordering.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const conversation = await prisma.conversation.findFirst({
    where: { id, ...conversationScope(user) },
  });
  if (!conversation) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const { searchParams } = req.nextUrl;
  const cursor = searchParams.get("cursor") || undefined;
  const limitParam = Number(searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    include: {
      // Only the sessionId is needed client-side — the chat card fetches
      // full payment detail itself via GET /api/payments/[id] (tasks #568
      // PR4). A message carries at most one proof in practice (messageId is
      // set once at ingest time), so [0] is the relevant one.
      paymentProofs: { select: { sessionId: true }, take: 1 },
    },
  });

  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  return NextResponse.json({
    messages: page.map(({ paymentProofs, ...message }) => ({
      ...message,
      paymentSessionId: paymentProofs[0]?.sessionId ?? null,
    })),
    nextCursor,
  });
}
