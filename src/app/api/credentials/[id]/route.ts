import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function DELETE(
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

  if (credential.status !== "revoked") {
    return NextResponse.json(
      { error: "Solo se pueden eliminar credenciales revocadas" },
      { status: 400 }
    );
  }

  const referencingBusiness = await prisma.business.findFirst({
    where: {
      OR: [{ aiCredentialId: id }, { whatsappCredentialId: id }],
    },
  });
  if (referencingBusiness) {
    return NextResponse.json(
      {
        error: `No se puede eliminar: está en uso por el negocio "${referencingBusiness.name}"`,
      },
      { status: 409 }
    );
  }

  await prisma.credential.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
