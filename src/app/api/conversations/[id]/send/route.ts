import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendBusinessMessage } from "@/lib/whatsapp";
import { getSessionUser } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const text = body.text as string;
  if (!text?.trim()) {
    return NextResponse.json({ error: "texto requerido" }, { status: 400 });
  }

  const conv = await prisma.conversation.findFirst({
    where: { id, business: { ownerId: user.id } },
    include: { business: true },
  });
  if (!conv) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  await sendBusinessMessage(conv.business, conv.customerPhone, text.trim());

  const msg = await prisma.message.create({
    data: {
      conversationId: conv.id,
      role: "assistant",
      content: text.trim(),
      mediaType: "text",
    },
  });

  return NextResponse.json(msg);
}
