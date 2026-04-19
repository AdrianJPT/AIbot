import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
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
