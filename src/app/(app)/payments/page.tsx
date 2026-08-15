import { redirect } from "next/navigation";
import { PaymentSessionStatus } from "@prisma/client";
import { PaymentInboxContainer } from "@/features/payments/containers/payment-inbox-container";
import type { PaymentInboxItem } from "@/features/payments/types";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { paymentSessionScope } from "@/lib/scope";
import { validateEvidenceAnalysis } from "@/lib/media";
import {
  proofDispatchId,
  serializeSessionSummary,
  type SessionWithRelations,
} from "@/lib/payments/serialize";

/**
 * Clean owner inbox (spec's "Filtered owner inbox" requirement) — only
 * `ready_to_confirm` sessions ever render here, with verdict flags, AI
 * suggestion context, and confirm/reject/preview/view-in-chat row actions
 * (tasks #568 PR3 phase 3/4). Server component + client container/
 * presentational split, same pattern as `/appointments`.
 */
export default async function PaymentsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const scope = paymentSessionScope(user);

  const [sessions, confirmedSessions] = await Promise.all([
    prisma.paymentSession.findMany({
      where: { ...scope, status: PaymentSessionStatus.ready_to_confirm },
      orderBy: { updatedAt: "desc" },
      include: {
        catalogItem: { select: { name: true, price: true, currency: true } },
        conversation: { select: { customerName: true, nickname: true } },
        proofs: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    // Balance/total counts ONLY confirmed sessions (spec's "Balance
    // integrity" scenario) — never ready_to_confirm/escalated/etc.
    prisma.paymentSession.findMany({
      where: { ...scope, status: PaymentSessionStatus.confirmed },
      select: {
        proofs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { extracted: true },
        },
      },
    }),
  ]);

  const items: PaymentInboxItem[] = await Promise.all(
    sessions.map(async (session) => {
      const latestProof = session.proofs[0];
      let aiMessage: string | null = null;
      if (latestProof) {
        const message = await prisma.message.findFirst({
          where: { dispatchId: proofDispatchId(latestProof.id) },
          select: { content: true },
        });
        aiMessage = message?.content ?? null;
      }
      return serializeSessionSummary(
        session as SessionWithRelations,
        aiMessage,
      );
    }),
  );

  // See serialize.ts's comment: PaymentSession.receivedAmount is never
  // written by the analysis job, so the confirmed-only total is derived
  // from each confirmed session's own latest proof extraction instead.
  const confirmedTotal = confirmedSessions.reduce((sum, session) => {
    const proof = session.proofs[0];
    if (!proof) return sum;
    const evidence = validateEvidenceAnalysis(proof.extracted);
    return sum + (evidence?.amount ?? 0);
  }, 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Pagos</h1>
        <div className="rounded-lg border border-border px-4 py-2">
          <p className="text-xs text-muted-foreground">
            Total confirmado ({confirmedSessions.length} pagos)
          </p>
          <p className="text-lg font-semibold">
            {(confirmedTotal / 100).toFixed(2)}
          </p>
        </div>
      </div>

      <PaymentInboxContainer items={items} />
    </div>
  );
}
