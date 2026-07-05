import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const credential = await prisma.credential.findFirst({
    where: { id, ownerId: user.id },
  });
  if (!credential) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  if (credential.status === "revoked") {
    return NextResponse.json(
      { error: "No se puede activar una credencial revocada" },
      { status: 400 }
    );
  }

  // Single transaction: demote any other active credential of the same
  // (ownerId, kind) to standby, then promote this one. Keeps exactly one
  // active credential per owner+kind at all times.
  const [, updated] = await prisma.$transaction([
    prisma.credential.updateMany({
      where: {
        ownerId: user.id,
        kind: credential.kind,
        status: "active",
        id: { not: credential.id },
      },
      data: { status: "standby" },
    }),
    prisma.credential.update({
      where: { id: credential.id },
      data: { status: "active" },
    }),
  ]);

  return NextResponse.json(updated);
}
