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
  isActive: true,
  priority: true,
  lastUsedAt: true,
  lastError: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const list = await prisma.credential.findMany({
    orderBy: [{ kind: "asc" }, { priority: "asc" }, { createdAt: "asc" }],
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
  if (kind === "ai" && provider === "custom" && !baseUrl) {
    return NextResponse.json(
      { error: "Base URL requerida para un proveedor custom" },
      { status: 400 }
    );
  }

  const encryptedKey = encryptSecret(key);
  const keyLast4 = key.slice(-4);

  // New "ai" credentials are appended at the END of the existing chain, so
  // adding a fallback key never silently promotes it to primary — an admin
  // has to explicitly reorder it. Priority/isActive aren't meaningful for
  // "whatsapp" credentials, so they just keep the schema defaults there.
  let priority = 0;
  if (kind === "ai") {
    const highest = await prisma.credential.findFirst({
      where: { ownerId: user.id, kind: "ai" },
      orderBy: { priority: "desc" },
      select: { priority: true },
    });
    priority = (highest?.priority ?? -1) + 1;
  }

  const created = await prisma.credential.create({
    data: {
      ownerId: user.id,
      kind,
      provider,
      label,
      encryptedKey,
      keyLast4,
      baseUrl: kind === "ai" ? baseUrl || null : null,
      isActive: true,
      priority,
    },
    select: CREDENTIAL_LIST_SELECT,
  });

  return NextResponse.json(created);
}
