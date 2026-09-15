import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendFromNumber } from "@/lib/whatsapp";
import { getSessionUser } from "@/lib/auth";
import { logEvent } from "@/lib/log";
import { conversationScope } from "@/lib/scope";
import {
  sendFailureFromError,
  type SendFailure,
} from "@/lib/channels/send-failure";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const conv = await prisma.conversation.findFirst({
    where: { id, ...conversationScope(user) },
    include: { business: true, phoneNumber: true },
  });
  if (!conv) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  let content: string;
  let sentBy: string;
  let retryOfId: string | undefined;
  const retryOf =
    typeof body.retryOf === "string" && body.retryOf ? body.retryOf : undefined;

  if (retryOf) {
    // Retry only ever re-inserts a row with the ORIGINAL sender (bot, since
    // only assistant/bot replies can fail and be retried here) — it never
    // creates a `sentBy: "customer"` row. reply-window-scheduler.ts's
    // customer-only batching query (`sentBy: "customer", batchedAt: null`,
    // served by the `[conversationId, sentBy, batchedAt, createdAt]` index)
    // is therefore structurally unaffected by this branch.
    //
    // Tenant scoping: `conv` above was already resolved through
    // `conversationScope(user)`, so filtering by `conversationId: conv.id`
    // here is sufficient — a retryOf id from another tenant's conversation
    // simply never matches and falls through to the same 404 as a missing
    // conversation (fail closed, no existence leak).
    const original = await prisma.message.findFirst({
      where: { id: retryOf, conversationId: conv.id },
    });
    if (!original) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    if (
      original.role !== "assistant" ||
      original.status !== "failed" ||
      original.failureCode === "window_expired"
    ) {
      return NextResponse.json(
        { error: "No se puede reintentar" },
        { status: 409 },
      );
    }
    // Closes the duplicate-send hole (defect 1): a stale UI can still offer
    // "Reintentar" on the original bubble after an earlier retry already
    // delivered it, so re-check here regardless of what the client believes.
    // A previous retry that ALSO failed must stay retryable, hence the
    // `status: { not: "failed" }` filter instead of "any row exists".
    const successfulRetry = await prisma.message.findFirst({
      where: { retryOfId: original.id, status: { not: "failed" } },
      select: { id: true },
    });
    if (successfulRetry) {
      return NextResponse.json(
        { error: "Este mensaje ya fue reintentado con éxito" },
        { status: 409 },
      );
    }
    content = original.content;
    sentBy = original.sentBy;
    retryOfId = original.id;
  } else {
    const text = body.text as string;
    if (!text?.trim()) {
      return NextResponse.json({ error: "texto requerido" }, { status: 400 });
    }
    content = text.trim();
    sentBy = "human";
  }

  let wamid: string | undefined;
  let failure: SendFailure | null = null;
  try {
    wamid = await sendFromNumber(
      conv.phoneNumber,
      conv.business.ownerId,
      conv.customerPhone,
      content,
    );
  } catch (err) {
    failure = sendFailureFromError(err);
    await logEvent(
      "error",
      "whatsapp-send",
      "sendMessage failed",
      {
        error: err instanceof Error ? err.message : String(err),
        conversationId: conv.id,
      },
      conv.business.id,
      conv.phoneNumberId,
    );
  }

  const [msg] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: conv.id,
        role: "assistant",
        content,
        mediaType: "text",
        sentBy,
        wamid,
        status: failure ? "failed" : "sent",
        failureCode: failure?.code,
        failureDetail: failure?.detail,
        retryOfId,
      },
    }),
    prisma.conversation.update({
      where: { id: conv.id },
      data: { lastMessageAt: new Date() },
    }),
  ]);

  return NextResponse.json(msg);
}
