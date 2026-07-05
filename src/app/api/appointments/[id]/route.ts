import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.appointment.findFirst({
    where: { id, business: { ownerId: user.id } },
  });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json();
  try {
    const a = await prisma.appointment.update({
      where: { id },
      data: {
        ...(body.customerName != null && { customerName: body.customerName }),
        ...(body.service != null && { service: body.service }),
        ...(body.date != null && { date: body.date }),
        ...(body.time != null && { time: body.time }),
        ...(body.status != null && { status: body.status }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
    });
    return NextResponse.json(a);
  } catch {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.appointment.findFirst({
    where: { id, business: { ownerId: user.id } },
  });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  try {
    await prisma.appointment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
}
