import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendFromNumber } from "@/lib/whatsapp";
import { getSessionUser } from "@/lib/auth";
import { logEvent } from "@/lib/log";
import { conversationScope } from "@/lib/scope";

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
    where: { id, ...conversationScope(user) },
    include: { business: true, phoneNumber: true },
  });
  if (!conv) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  let wamid: string | undefined;
  let sendFailed = false;
  try {
    wamid = await sendFromNumber(
      conv.phoneNumber,
      conv.business.ownerId,
      conv.customerPhone,
      text.trim()
    );
  } catch (err) {
    sendFailed = true;
    await logEvent(
      "error",
      "whatsapp-send",
      "sendMessage failed",
      { error: err instanceof Error ? err.message : String(err), conversationId: conv.id },
      conv.business.id,
      conv.phoneNumberId
    );
  }

  const [msg] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: conv.id,
        role: "assistant",
        content: text.trim(),
        mediaType: "text",
        sentBy: "human",
        wamid,
        status: sendFailed ? "failed" : "sent",
      },
    }),
    prisma.conversation.update({
      where: { id: conv.id },
      data: { lastMessageAt: new Date() },
    }),
  ]);

  return NextResponse.json(msg);
}
