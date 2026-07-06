import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { businessScope } from "@/lib/scope";
import { ensureWhatsappCredential } from "@/lib/whatsapp";
import { flattenBusinessPhoneNumber } from "@/lib/business-phone-compat";

// GET stays open to any authenticated caller (scoped by businessScope).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const b = await prisma.business.findFirst({
    where: { id, ...businessScope(user) },
    include: { phoneNumbers: true },
  });
  if (!b) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(flattenBusinessPhoneNumber(b));
}

// Editing/removing a business is admin-only (see POST /api/businesses).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const { id } = await params;
  const existing = await prisma.business.findFirst({
    where: { id },
    include: { phoneNumbers: true },
  });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json();
  const currentPhoneNumber = existing.phoneNumbers[0];

  const changesPhoneNumberFields =
    body.phoneNumberId != null ||
    "displayPhone" in body ||
    "whatsappCredentialId" in body ||
    body.whatsappToken;

  if (changesPhoneNumberFields && !currentPhoneNumber) {
    return NextResponse.json(
      { error: "Este negocio no tiene un número asociado" },
      { status: 409 }
    );
  }

  if (body.aiCredentialId || body.whatsappCredentialId) {
    const wanted = [body.aiCredentialId, body.whatsappCredentialId].filter(
      (v): v is string => Boolean(v)
    );
    const count = await prisma.credential.count({
      where: { id: { in: wanted }, ownerId: admin.id },
    });
    if (count !== wanted.length) {
      return NextResponse.json({ error: "Credencial inválida" }, { status: 400 });
    }
  }

  // A pasted raw token always wins over whatsappCredentialId — the edit
  // form submits whatsappCredentialId on every save (even as null), so
  // checking `"whatsappCredentialId" in body` first would never let a
  // freshly-typed token take effect.
  let resolvedWhatsappCredentialId: string | null | undefined;
  if (body.whatsappToken) {
    if (!existing.ownerId) {
      return NextResponse.json(
        {
          error:
            "No se puede asignar un token de WhatsApp: el negocio no tiene un cliente asignado",
        },
        { status: 400 }
      );
    }
    resolvedWhatsappCredentialId = await ensureWhatsappCredential(
      existing.ownerId,
      `WhatsApp (${existing.name})`,
      body.whatsappToken
    );
  } else if ("whatsappCredentialId" in body) {
    resolvedWhatsappCredentialId = body.whatsappCredentialId || null;
  }

  const phoneNumberChanges = {
    ...(body.phoneNumberId != null && { phoneNumberId: body.phoneNumberId }),
    ...("displayPhone" in body && { displayPhone: body.displayPhone || null }),
    ...(resolvedWhatsappCredentialId !== undefined && {
      whatsappCredentialId: resolvedWhatsappCredentialId,
    }),
  };

  try {
    const b = await prisma.business.update({
      where: { id },
      data: {
        ...(body.name != null && { name: body.name }),
        ...(body.systemPrompt != null && { systemPrompt: body.systemPrompt }),
        ...(body.welcomeMessage != null && { welcomeMessage: body.welcomeMessage }),
        ...(body.businessInfo != null && { businessInfo: body.businessInfo }),
        ...("model" in body && { model: body.model || null }),
        ...("visionModel" in body && { visionModel: body.visionModel || null }),
        ...("audioModel" in body && { audioModel: body.audioModel || null }),
        ...(body.maxHistoryMessages != null && {
          maxHistoryMessages: body.maxHistoryMessages,
        }),
        ...(body.isActive != null && { isActive: body.isActive }),
        ...("aiCredentialId" in body && { aiCredentialId: body.aiCredentialId || null }),
        ...(currentPhoneNumber &&
          Object.keys(phoneNumberChanges).length > 0 && {
            phoneNumbers: {
              update: {
                where: { id: currentPhoneNumber.id },
                data: phoneNumberChanges,
              },
            },
          }),
      },
      include: { phoneNumbers: true },
    });
    return NextResponse.json(flattenBusinessPhoneNumber(b));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "Ese número ya está registrado en otro cliente" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const { id } = await params;
  const existing = await prisma.business.findFirst({ where: { id } });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  try {
    await prisma.business.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
}
