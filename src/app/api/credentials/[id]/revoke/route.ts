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

  const referencingBusiness = await prisma.business.findFirst({
    where: {
      OR: [{ aiCredentialId: id }, { whatsappCredentialId: id }],
    },
  });
  if (referencingBusiness) {
    return NextResponse.json(
      {
        error: `No se puede revocar: está en uso por el negocio "${referencingBusiness.name}"`,
      },
      { status: 409 }
    );
  }

  const updated = await prisma.credential.update({
    where: { id },
    data: { status: "revoked" },
  });
  return NextResponse.json(updated);
}
