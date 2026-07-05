import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { testAiCredential, testWhatsappCredential } from "@/lib/credentials/provider-test";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const { id } = await params;
  const credential = await prisma.credential.findFirst({ where: { id } });
  if (!credential) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  if (credential.status === "revoked") {
    return NextResponse.json(
      { error: "No se puede probar una credencial revocada" },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const result =
    credential.kind === "ai"
      ? await testAiCredential(credential)
      : await testWhatsappCredential(credential, body?.phoneNumberId);

  await prisma.credential.update({
    where: { id },
    data: {
      lastUsedAt: new Date(),
      lastError: result.ok ? null : result.error,
    },
  });

  return NextResponse.json(result);
}
