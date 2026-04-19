import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const c = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: {
      business: true,
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!c) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(c);
}
