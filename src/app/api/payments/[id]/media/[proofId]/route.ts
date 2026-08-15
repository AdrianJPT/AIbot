import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { paymentSessionScope } from "@/lib/scope";

/**
 * Auth-gated proof media preview (design decision 8 / tasks #568 PR3 phase
 * 2). Meta's CDN media id (`PaymentProof.waMediaId`) expires ~30 days, so
 * this serves the bytes persisted at analysis time
 * (`PaymentProof.mediaData`, slice 3 — see analysis-job.ts) instead of
 * re-fetching from WhatsApp. Scoped exactly like every other payments route:
 * the session must belong to the caller's business (or the caller is admin),
 * and the proof must belong to that session.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; proofId: string }> },
) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, proofId } = await params;

  const session = await prisma.paymentSession.findFirst({
    where: { id, ...paymentSessionScope(user) },
    select: { id: true },
  });
  if (!session) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const proof = await prisma.paymentProof.findFirst({
    where: { id: proofId, sessionId: session.id },
    select: { mediaData: true, mediaMimeType: true },
  });
  if (!proof || !proof.mediaData) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(proof.mediaData), {
    status: 200,
    headers: {
      "Content-Type": proof.mediaMimeType || "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
