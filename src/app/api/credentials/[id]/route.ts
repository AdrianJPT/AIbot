import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { findCredentialUsageBusinessName } from "@/lib/credentials/usage";

const CREDENTIAL_SELECT = {
  id: true,
  kind: true,
  provider: true,
  label: true,
  keyLast4: true,
  baseUrl: true,
  lastUsedAt: true,
  lastError: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function DELETE(
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
        error: `No se puede eliminar: está en uso por el negocio "${referencingBusinessName}"`,
      },
      { status: 409 }
    );
  }

  const appConfig = await prisma.appConfig.findFirst({
    where: { id: "default" },
  });
  if (appConfig?.aiCredentialId === id || appConfig?.whatsappCredentialId === id) {
    return NextResponse.json(
      { error: "No se puede eliminar: es la credencial por defecto en Configuración" },
      { status: 409 }
    );
  }

  await prisma.credential.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const { id } = await params;
  const credential = await prisma.credential.findFirst({ where: { id } });
  if (!credential) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { label, baseUrl, key } = body;

  if (label !== undefined && !label) {
    return NextResponse.json({ error: "El label no puede estar vacío" }, { status: 400 });
  }

  const data: {
    label?: string;
    baseUrl?: string | null;
    encryptedKey?: string;
    keyLast4?: string;
  } = {};

  if (label) data.label = label;
  if (baseUrl !== undefined) {
    data.baseUrl = credential.kind === "ai" ? baseUrl || null : null;
  }
  if (typeof key === "string" && key) {
    data.encryptedKey = encryptSecret(key);
    data.keyLast4 = key.slice(-4);
  }

  const updated = await prisma.credential.update({
    where: { id },
    data,
    select: CREDENTIAL_SELECT,
  });

  return NextResponse.json(updated);
}
