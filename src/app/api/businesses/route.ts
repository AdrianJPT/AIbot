import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const list = await prisma.business.findMany({
    where: { ownerId: user.id },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const {
    name,
    phoneNumberId,
    whatsappToken,
    systemPrompt,
    welcomeMessage,
    businessInfo,
    model,
    maxHistoryMessages,
    isActive,
  } = body;

  if (!name || !phoneNumberId || !whatsappToken || !systemPrompt || !welcomeMessage) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }

  const b = await prisma.business.create({
    data: {
      name,
      phoneNumberId,
      whatsappToken,
      systemPrompt,
      welcomeMessage,
      businessInfo: businessInfo ?? {},
      model: model || "gpt-4o-mini",
      maxHistoryMessages: maxHistoryMessages ?? 20,
      isActive: isActive !== false,
      ownerId: user.id,
    },
  });
  return NextResponse.json(b);
}
