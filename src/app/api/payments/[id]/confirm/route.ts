import { NextRequest, NextResponse } from "next/server";
import { PaymentSessionStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { paymentSessionScope } from "@/lib/scope";
import { applyTransition } from "@/lib/payments/state-machine";
import { sendAndPersistReply } from "@/lib/message-handler";
import { logEvent } from "@/lib/log";

const CONFIRMATION_MESSAGE = "¡Gracias! Confirmamos tu pago.";
const PARTIAL_CONFIRMATION_MESSAGE =
  "¡Gracias! Confirmamos tu pago parcial. Seguimos en contacto por el resto.";

/**
 * Owner confirmation — spec's "Owner confirmation authority" requirement:
 * only this route (an authenticated owner action) can move a session to
 * `confirmed`. AI verdicts never call this; the analysis job (slice 2) only
 * ever reaches `ready_to_confirm`, never `confirmed`.
 *
 * `partial` override (product decision, Engram #562): default is
 * hold-until-complete, so a session flagged `statusReason: "partial"`
 * requires an explicit `{ partial: true }` body to confirm as-is; anything
 * else is rejected with 409 so the owner can't accidentally close out an
 * incomplete payment from a generic "confirm" click.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const partialOverride =
    typeof body === "object" && body !== null && "partial" in body
      ? Boolean((body as { partial?: unknown }).partial)
      : false;

  const session = await prisma.paymentSession.findFirst({
    where: { id, ...paymentSessionScope(user) },
    include: {
      business: true,
      conversation: { include: { phoneNumber: true } },
    },
  });
  if (!session) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  if (session.status !== PaymentSessionStatus.ready_to_confirm) {
    return NextResponse.json(
      { error: "La sesión no está lista para confirmar" },
      { status: 409 },
    );
  }

  if (session.statusReason === "partial" && !partialOverride) {
    return NextResponse.json(
      {
        error:
          "Pago parcial: use la confirmación parcial explícita para forzar el cierre",
      },
      { status: 409 },
    );
  }

  let transition;
  try {
    transition = applyTransition(
      { status: session.status, autonomyRounds: session.autonomyRounds },
      "owner_confirmed",
    );
  } catch {
    return NextResponse.json(
      { error: "Transición inválida" },
      { status: 409 },
    );
  }

  const now = new Date();
  await prisma.paymentSession.update({
    where: { id: session.id },
    data: {
      status: transition.status,
      confirmedById: user.id,
      confirmedAt: now,
    },
  });

  await prisma.paymentAuditEntry.createMany({
    data: [
      {
        sessionId: session.id,
        actor: "human",
        action: partialOverride ? "override" : "owner_confirmed",
        detail: { confirmedById: user.id, partial: partialOverride },
      },
      {
        sessionId: session.id,
        actor: "system",
        action: transition.audit.action,
        detail: transition.audit.detail as Prisma.InputJsonValue | undefined,
      },
    ],
  });

  const dispatchId = `payment-confirm:${session.id}:${now.getTime()}`;
  try {
    await sendAndPersistReply(
      session.business,
      session.conversation.phoneNumber,
      session.conversationId,
      session.customerPhone,
      partialOverride ? PARTIAL_CONFIRMATION_MESSAGE : CONFIRMATION_MESSAGE,
      dispatchId,
      [],
    );
  } catch (err) {
    await logEvent(
      "error",
      "ai",
      "payment confirmation customer notification failed",
      {
        error: err instanceof Error ? err.message : String(err),
        sessionId: session.id,
      },
      session.business.id,
      session.conversation.phoneNumberId,
    );
  }

  return NextResponse.json({ ok: true, status: transition.status });
}
