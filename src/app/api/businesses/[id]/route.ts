import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const b = await prisma.business.findFirst({ where: { id, ownerId: user.id } });
  if (!b) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(b);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.business.findFirst({ where: { id, ownerId: user.id } });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json();

  if (body.aiCredentialId || body.whatsappCredentialId) {
    const wanted = [body.aiCredentialId, body.whatsappCredentialId].filter(
      (v): v is string => Boolean(v)
    );
    const count = await prisma.credential.count({
      where: { id: { in: wanted }, ownerId: user.id },
    });
    if (count !== wanted.length) {
      return NextResponse.json({ error: "Credencial inválida" }, { status: 400 });
    }
  }

  try {
    const b = await prisma.business.update({
      where: { id },
      data: {
        ...(body.name != null && { name: body.name }),
        ...(body.phoneNumberId != null && { phoneNumberId: body.phoneNumberId }),
        ...(body.whatsappToken != null && { whatsappToken: body.whatsappToken }),
        ...(body.systemPrompt != null && { systemPrompt: body.systemPrompt }),
        ...(body.welcomeMessage != null && { welcomeMessage: body.welcomeMessage }),
        ...(body.businessInfo != null && { businessInfo: body.businessInfo }),
        ...(body.model != null && { model: body.model }),
        ...(body.maxHistoryMessages != null && {
          maxHistoryMessages: body.maxHistoryMessages,
        }),
        ...(body.isActive != null && { isActive: body.isActive }),
        ...("aiCredentialId" in body && { aiCredentialId: body.aiCredentialId || null }),
        ...("whatsappCredentialId" in body && {
          whatsappCredentialId: body.whatsappCredentialId || null,
        }),
      },
    });
    return NextResponse.json(b);
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
  const existing = await prisma.business.findFirst({ where: { id, ownerId: user.id } });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  try {
    await prisma.business.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
}
