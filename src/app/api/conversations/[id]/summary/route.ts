import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { conversationScope } from "@/lib/scope";

/**
 * Clears a conversation's rolling summary.
 *
 * This is the operator's lever over conversation memory, and it exists because
 * the summary is the one piece of the prompt that is model-generated, persisted,
 * and replayed on every later flush. Sanitizing and capping it bounds the damage
 * a poisoned summary can do; being able to *see and wipe* it is what makes the
 * damage recoverable. Without this endpoint a bad summary would follow a customer
 * around until the conversation died.
 *
 * Nulling both columns together is the whole operation. `summarizedThroughAt` is
 * the watermark that hides older messages from the raw tail, so clearing the
 * summary without clearing the watermark would leave the conversation with no
 * memory *and* a truncated history — strictly worse than either. The next flush
 * past the cadence threshold then rebuilds from the raw messages.
 *
 * Scoped like every other conversation route: any authenticated user, narrowed by
 * `conversationScope`, so a client can only reach their own business's threads
 * and an out-of-scope id is a 404 rather than a 403 — same shape as the handoff
 * route, and it does not confirm the row exists to someone who cannot see it.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.conversation.findFirst({
    where: { id, ...conversationScope(user) },
  });
  if (!existing)
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  try {
    const c = await prisma.conversation.update({
      where: { id },
      // Prisma.DbNull, not null: for a nullable Json column plain `null` is a
      // type error, and Prisma.JsonNull would store the JSON value `null` rather
      // than a SQL NULL. The read path treats SQL NULL as "no summary".
      data: { summary: Prisma.DbNull, summarizedThroughAt: null },
    });
    return NextResponse.json(c);
  } catch {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
}
