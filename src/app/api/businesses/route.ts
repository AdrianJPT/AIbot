import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { businessScope } from "@/lib/scope";

// GET stays open to any authenticated caller (scoped by businessScope) — it
// also backs the client-facing business picker on /appointments/new, not
// just the admin management UI.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const list = await prisma.business.findMany({
    where: businessScope(user),
    orderBy: { name: "asc" },
  });
  return NextResponse.json(list);
}

// Creating a business (registering a client's phone number) is admin-only —
// numbers are managed from Admin > Clients > [client], never self-service.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json();
  const {
    ownerId,
    name,
    phoneNumberId,
    displayPhone,
    whatsappToken,
    systemPrompt,
    welcomeMessage,
    businessInfo,
    model,
    visionModel,
    audioModel,
    maxHistoryMessages,
    isActive,
    aiCredentialId,
    whatsappCredentialId,
  } = body;

  if (!ownerId || !name || !phoneNumberId || !systemPrompt || !welcomeMessage) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }

  if (!whatsappToken && !whatsappCredentialId) {
    return NextResponse.json(
      { error: "Asigná una credencial de WhatsApp o cargá un token" },
      { status: 400 }
    );
  }

  const owner = await prisma.user.findUnique({ where: { id: ownerId } });
  if (!owner) {
    return NextResponse.json({ error: "Cliente inválido" }, { status: 400 });
  }

  if (aiCredentialId || whatsappCredentialId) {
    const owned = await ownsCredentials(admin.id, [aiCredentialId, whatsappCredentialId]);
    if (!owned) {
      return NextResponse.json({ error: "Credencial inválida" }, { status: 400 });
    }
  }

  try {
    const b = await prisma.business.create({
      data: {
        name,
        phoneNumberId,
        displayPhone: displayPhone || null,
        whatsappToken: whatsappToken || "",
        systemPrompt,
        welcomeMessage,
        businessInfo: businessInfo ?? {},
        model: model || null,
        visionModel: visionModel || null,
        audioModel: audioModel || null,
        maxHistoryMessages: maxHistoryMessages ?? 20,
        isActive: isActive !== false,
        ownerId,
        aiCredentialId: aiCredentialId || null,
        whatsappCredentialId: whatsappCredentialId || null,
      },
    });
    return NextResponse.json(b);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "Ese número ya está registrado en otro cliente" },
        { status: 409 }
      );
    }
    throw err;
  }
}

async function ownsCredentials(
  ownerId: string,
  ids: Array<string | null | undefined>
): Promise<boolean> {
  const wanted = ids.filter((id): id is string => Boolean(id));
  if (wanted.length === 0) return true;
  const count = await prisma.credential.count({
    where: { id: { in: wanted }, ownerId },
  });
  return count === wanted.length;
}
