import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

const SELECT = {
  whatsappCredentialId: true,
  chatModel: true,
  visionModel: true,
  audioModel: true,
  updatedAt: true,
} as const;

// Singleton platform-wide AI defaults (id is always "default"). Businesses
// without their own model override inherit these — see resolveModels() in
// src/lib/ai/resolve.ts. Editing this is a form save, not a deploy. There
// is no aiCredentialId here (removed): a business without its own pin now
// resolves against its owner's ordered chain of active Credential rows
// instead of a single platform-wide default — see
// callWithAiCredential()/resolveCandidates() in src/lib/ai/resolve.ts.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const config = await prisma.appConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
    select: SELECT,
  });
  return NextResponse.json(config);
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json();
  const { whatsappCredentialId, chatModel, visionModel, audioModel } = body;

  if (whatsappCredentialId) {
    const owned = await prisma.credential.count({
      where: { id: whatsappCredentialId, ownerId: admin.id, kind: "whatsapp" },
    });
    if (!owned) {
      return NextResponse.json({ error: "Credencial inválida" }, { status: 400 });
    }
  }

  if (!chatModel || !visionModel || !audioModel) {
    return NextResponse.json(
      { error: "Los 3 modelos por defecto son obligatorios" },
      { status: 400 }
    );
  }

  const config = await prisma.appConfig.upsert({
    where: { id: "default" },
    update: {
      whatsappCredentialId: whatsappCredentialId || null,
      chatModel,
      visionModel,
      audioModel,
    },
    create: {
      id: "default",
      whatsappCredentialId: whatsappCredentialId || null,
      chatModel,
      visionModel,
      audioModel,
    },
    select: SELECT,
  });
  return NextResponse.json(config);
}
