import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { conversationScope } from "@/lib/scope";

/**
 * Marks a conversation as read by zeroing its `unreadCount`. Called when
 * the admin opens a thread in the chat UI.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;

  const existing = await prisma.conversation.findFirst({
    where: { id, ...conversationScope(user) },
  });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const conversation = await prisma.conversation.update({
    where: { id },
    data: { unreadCount: 0 },
  });

  return NextResponse.json(conversation);
}
