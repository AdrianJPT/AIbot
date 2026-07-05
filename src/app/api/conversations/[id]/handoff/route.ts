import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const status = body.status as string;
  if (!["active", "handed_off", "closed"].includes(status)) {
    return NextResponse.json({ error: "status inválido" }, { status: 400 });
  }

  const existing = await prisma.conversation.findFirst({
    where: { id, business: { ownerId: user.id } },
  });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  try {
    const c = await prisma.conversation.update({
      where: { id },
      data: { status },
    });
    return NextResponse.json(c);
  } catch {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
}
