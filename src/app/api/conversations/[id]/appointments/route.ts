import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

/**
 * Read-only list of appointments linked to a conversation
 * (`Appointment.conversationId`) for the "Citas" panel in the thread header.
 * No mutations here — appointments are still created via the existing
 * `/appointments/new` flow.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const conversation = await prisma.conversation.findFirst({
    where: { id, business: { ownerId: user.id } },
  });
  if (!conversation) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const appointments = await prisma.appointment.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(appointments);
}
