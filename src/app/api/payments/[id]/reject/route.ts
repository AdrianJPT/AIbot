import { NextRequest, NextResponse } from "next/server";
import { PaymentSessionStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { paymentSessionScope } from "@/lib/scope";
import { applyTransition } from "@/lib/payments/state-machine";
import { sendAndPersistReply } from "@/lib/message-handler";
import { logEvent } from "@/lib/log";

const DEFAULT_REJECTION_MESSAGE =
  "No pudimos validar tu comprobante de pago. Un miembro de nuestro equipo se va a poner en contacto.";

/**
 * Owner rejection — spec's "Owner confirmation authority" requirement:
 * moves a `ready_to_confirm` session to `rejected`; customer notification is
 * optional (`{ notifyCustomer: false }` skips it), unlike confirm's always-on
 * notification, since a rejection sometimes needs a human follow-up call
 * instead of an automated message.
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
  const parsed =
    typeof body === "object" && body !== null
      ? (body as { notifyCustomer?: unknown; reason?: unknown })
      : {};
  const notifyCustomer = parsed.notifyCustomer !== false;
  const reason =
    typeof parsed.reason === "string" && parsed.reason.trim() !== ""
      ? parsed.reason.trim()
      : null;

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
      { error: "La sesión no está lista para rechazar" },
      { status: 409 },
    );
  }

  let transition;
  try {
    transition = applyTransition(
      { status: session.status, autonomyRounds: session.autonomyRounds },
      "owner_rejected",
    );
  } catch {
    return NextResponse.json(
      { error: "Transición inválida" },
      { status: 409 },
    );
  }

  await prisma.paymentSession.update({
    where: { id: session.id },
    data: { status: transition.status },
  });

  await prisma.paymentAuditEntry.createMany({
    data: [
      {
        sessionId: session.id,
        actor: "human",
        action: "owner_rejected",
        detail: { rejectedById: user.id, reason },
      },
      {
        sessionId: session.id,
        actor: "system",
        action: transition.audit.action,
        detail: transition.audit.detail as Prisma.InputJsonValue | undefined,
      },
    ],
  });

  if (notifyCustomer) {
    const dispatchId = `payment-reject:${session.id}:${Date.now()}`;
    try {
      await sendAndPersistReply(
        session.business,
        session.conversation.phoneNumber,
        session.conversationId,
        session.customerPhone,
        DEFAULT_REJECTION_MESSAGE,
        dispatchId,
        [],
      );
    } catch (err) {
      await logEvent(
        "error",
        "ai",
        "payment rejection customer notification failed",
        {
          error: err instanceof Error ? err.message : String(err),
          sessionId: session.id,
        },
        session.business.id,
        session.conversation.phoneNumberId,
      );
    }
  }

  return NextResponse.json({ ok: true, status: transition.status });
}
