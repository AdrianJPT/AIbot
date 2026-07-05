import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";

const VALID_KINDS = ["ai", "whatsapp"];

const CREDENTIAL_LIST_SELECT = {
  id: true,
  kind: true,
  provider: true,
  label: true,
  keyLast4: true,
  baseUrl: true,
  status: true,
  lastUsedAt: true,
  lastError: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const list = await prisma.credential.findMany({
    orderBy: [{ kind: "asc" }, { createdAt: "desc" }],
    select: CREDENTIAL_LIST_SELECT,
  });
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json();
  const { kind, provider, label, key, baseUrl } = body;

  if (!VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: "kind inválido" }, { status: 400 });
  }
  if (!provider || !label || !key) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }

  const encryptedKey = encryptSecret(key);
  const keyLast4 = key.slice(-4);

  const created = await prisma.credential.create({
    data: {
      ownerId: user.id,
      kind,
      provider,
      label,
      encryptedKey,
      keyLast4,
      baseUrl: kind === "ai" ? baseUrl || null : null,
    },
    select: CREDENTIAL_LIST_SELECT,
  });

  return NextResponse.json(created);
}
