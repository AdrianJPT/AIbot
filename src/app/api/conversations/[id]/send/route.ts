import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendMessage } from "@/lib/whatsapp";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const text = body.text as string;
  if (!text?.trim()) {
    return NextResponse.json({ error: "texto requerido" }, { status: 400 });
  }

  const conv = await prisma.conversation.findUnique({
    where: { id },
    include: { business: true },
  });
  if (!conv) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  await sendMessage(
    conv.business.phoneNumberId,
    conv.business.whatsappToken,
    conv.customerPhone,
    text.trim()
  );

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
