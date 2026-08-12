import { NextRequest, NextResponse } from "next/server";
import { PaymentSessionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { paymentSessionScope } from "@/lib/scope";
import {
  proofDispatchId,
  serializeSessionSummary,
  type SessionWithRelations,
} from "@/lib/payments/serialize";

/**
 * Owner inbox (spec's "Filtered owner inbox" requirement, tasks #568 PR3
 * phase 2). Only `ready_to_confirm` sessions ever appear here — everything
 * else (awaiting_proof/analyzing/customer_action/escalated/confirmed/
 * rejected/expired) is either still being handled autonomously by the AI or
 * already resolved, per docs/payment-verification-engine.md's verdict
 * taxonomy table.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const businessId = req.nextUrl.searchParams.get("businessId");

  const sessions = await prisma.paymentSession.findMany({
    where: {
      ...paymentSessionScope(user),
      status: PaymentSessionStatus.ready_to_confirm,
      ...(businessId && { businessId }),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      catalogItem: { select: { name: true, price: true, currency: true } },
      conversation: { select: { customerName: true, nickname: true } },
      proofs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const items = await Promise.all(
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

  return NextResponse.json(items);
}
