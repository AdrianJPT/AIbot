import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { appointmentScope, businessScope, conversationScope } from "@/lib/scope";
import { isAppointmentStatus } from "@/lib/appointment-status";

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim() !== "";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const businessId = req.nextUrl.searchParams.get("businessId");
  const status = req.nextUrl.searchParams.get("status");
  const date = req.nextUrl.searchParams.get("date");

  const list = await prisma.appointment.findMany({
    where: {
      ...appointmentScope(user),
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
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

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

  if (
    !isNonEmptyString(businessId) ||
    !isNonEmptyString(customerPhone) ||
    !isNonEmptyString(customerName) ||
    !isNonEmptyString(service) ||
    !isNonEmptyString(date) ||
    !isNonEmptyString(time)
  ) {
    return NextResponse.json(
      { error: "Faltan campos requeridos" },
      { status: 400 },
    );
  }

  if (conversationId !== undefined && typeof conversationId !== "string") {
    return NextResponse.json(
      { error: "conversationId inválido" },
      { status: 400 },
    );
  }

  if (status !== undefined && !isAppointmentStatus(status)) {
    return NextResponse.json({ error: "status inválido" }, { status: 400 });
  }

  const business = await prisma.business.findFirst({
    where: { id: businessId, ...businessScope(user) },
  });
  if (!business) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  if (conversationId) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, ...conversationScope(user) },
    });
    if (!conversation) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
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
      status: status ?? "pending",
    },
  });
  return NextResponse.json(a);
}
