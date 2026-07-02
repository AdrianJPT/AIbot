import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const b = await prisma.business.findUnique({ where: { id } });
  if (!b) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(b);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
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
        ...(body.provider != null && { provider: body.provider }),
        ...(body.model != null && { model: body.model }),
        ...(body.maxHistoryMessages != null && {
          maxHistoryMessages: body.maxHistoryMessages,
        }),
        ...(body.isActive != null && { isActive: body.isActive }),
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
  const { id } = await params;
  try {
    await prisma.business.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
}
