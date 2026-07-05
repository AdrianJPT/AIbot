import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { conversationScope } from "@/lib/scope";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const businessId = req.nextUrl.searchParams.get("businessId");
  const status = req.nextUrl.searchParams.get("status");
  const q = req.nextUrl.searchParams.get("q")?.trim();

  const list = await prisma.conversation.findMany({
    where: {
      ...conversationScope(user),
      ...(businessId && { businessId }),
      ...(status && { status }),
      // `mode: "insensitive"` compiles to ILIKE on Postgres.
      ...(q && {
        OR: [
          { customerName: { contains: q, mode: "insensitive" } },
          { customerPhone: { contains: q, mode: "insensitive" } },
        ],
      }),
    },
    orderBy: { lastMessageAt: "desc" },
    include: {
      business: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const result = list.map(({ messages, ...conversation }) => ({
    ...conversation,
    lastMessage: messages[0] ?? null,
  }));

  return NextResponse.json(result);
}
