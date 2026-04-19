import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  const status = req.nextUrl.searchParams.get("status");
  const date = req.nextUrl.searchParams.get("date");

  const list = await prisma.appointment.findMany({
    where: {
      ...(businessId && { businessId }),
      ...(status && { status }),
      ...(date && { date }),
    },
    orderBy: { createdAt: "desc" },
    include: { business: { select: { name: true } } },
  });
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    businessId,
    conversationId,
    customerPhone,
    customerName,
    service,
    date,
    time,
    notes,
    status,
  } = body;

  if (!businessId || !customerPhone || !customerName || !service || !date || !time) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }

  const a = await prisma.appointment.create({
    data: {
      businessId,
      conversationId: conversationId || null,
      customerPhone,
      customerName,
      service,
      date,
      time,
      notes: notes || null,
      status: status || "pending",
    },
  });
  return NextResponse.json(a);
}
