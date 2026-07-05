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
