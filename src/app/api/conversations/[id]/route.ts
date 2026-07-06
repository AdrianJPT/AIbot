import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { conversationScope } from "@/lib/scope";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const c = await prisma.conversation.findFirst({
    where: { id, ...conversationScope(user) },
    include: {
      business: true,
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!c) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(c);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.conversation.findFirst({
    where: { id, ...conversationScope(user) },
  });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.conversation.update({
    where: { id },
    data: { nickname: (body.nickname as string)?.trim() || null },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.conversation.findFirst({
    where: { id, ...conversationScope(user) },
  });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  // Cascades to Message and Appointment.conversationId (SET NULL) per schema.
  await prisma.conversation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
