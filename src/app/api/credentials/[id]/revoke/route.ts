import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { findCredentialUsageBusinessName } from "@/lib/credentials/usage";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const { id } = await params;
  const credential = await prisma.credential.findFirst({ where: { id } });
  if (!credential) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const referencingBusinessName = await findCredentialUsageBusinessName(id);
  if (referencingBusinessName) {
    return NextResponse.json(
      {
        error: `No se puede revocar: está en uso por el negocio "${referencingBusinessName}"`,
      },
      { status: 409 }
    );
  }

  const appConfig = await prisma.appConfig.findFirst({
    where: { id: "default", aiCredentialId: id },
  });
  if (appConfig) {
    return NextResponse.json(
      { error: "No se puede revocar: es la credencial de IA por defecto en Configuración" },
      { status: 409 }
    );
  }

  const updated = await prisma.credential.update({
    where: { id },
    data: { status: "revoked" },
  });
  return NextResponse.json(updated);
}
