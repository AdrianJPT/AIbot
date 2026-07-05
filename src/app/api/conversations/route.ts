import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const businessId = req.nextUrl.searchParams.get("businessId");
  const status = req.nextUrl.searchParams.get("status");

  const list = await prisma.conversation.findMany({
    where: {
      ...(businessId && { businessId }),
      ...(status && { status }),
    },
    orderBy: { updatedAt: "desc" },
    include: { business: { select: { name: true } } },
  });
  return NextResponse.json(list);
}
