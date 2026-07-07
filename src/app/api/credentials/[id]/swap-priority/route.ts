import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

/**
 * Atomically swaps the `priority` of two "ai" credentials — used by the
 * reorder (move up/down) controls in the credential table. Doing this as
 * two independent PATCH calls (the previous approach) is a race: if the
 * second PATCH fails after the first succeeds, both rows end up with the
 * same priority with no rollback, and rapid clicks before a refetch
 * completes can interleave against stale data. A single transaction makes
 * the swap all-or-nothing.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { withId } = body;

  if (typeof withId !== "string" || !withId) {
    return NextResponse.json({ error: "Falta withId" }, { status: 400 });
  }
  if (withId === id) {
    return NextResponse.json({ error: "No se puede intercambiar con sí misma" }, { status: 400 });
  }

  const [current, other] = await Promise.all([
    prisma.credential.findFirst({ where: { id, kind: "ai" } }),
    prisma.credential.findFirst({ where: { id: withId, kind: "ai" } }),
  ]);

  if (!current || !other) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const [updatedCurrent, updatedOther] = await prisma.$transaction([
    prisma.credential.update({
      where: { id: current.id },
      data: { priority: other.priority },
    }),
    prisma.credential.update({
      where: { id: other.id },
      data: { priority: current.priority },
    }),
  ]);

  return NextResponse.json({ ok: true, credentials: [updatedCurrent, updatedOther] });
}
