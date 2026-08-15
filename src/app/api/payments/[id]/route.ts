import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { paymentSessionScope } from "@/lib/scope";
import {
  proofDispatchId,
  serializeAuditEntry,
  serializeProof,
  serializeSessionSummary,
  type SessionWithRelations,
} from "@/lib/payments/serialize";

/**
 * Payment session detail — session + every proof + the full audit trail
 * (spec's "Auditability" requirement), scoped like every other payments
 * route. Used by the dashboard's detail/expanded view (tasks #568 PR3).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;

  const session = await prisma.paymentSession.findFirst({
    where: { id, ...paymentSessionScope(user) },
    include: {
      catalogItem: { select: { name: true, price: true, currency: true } },
      conversation: { select: { customerName: true, nickname: true } },
      proofs: { orderBy: { createdAt: "desc" } },
      auditEntries: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!session) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const latestProof = session.proofs[0] ?? null;
  let aiMessage: string | null = null;
  if (latestProof) {
    const message = await prisma.message.findFirst({
      where: { dispatchId: proofDispatchId(latestProof.id) },
      select: { content: true },
    });
    aiMessage = message?.content ?? null;
  }

  return NextResponse.json({
    ...serializeSessionSummary(session as SessionWithRelations, aiMessage),
    proofs: session.proofs.map(serializeProof),
    auditEntries: session.auditEntries.map(serializeAuditEntry),
  });
}
