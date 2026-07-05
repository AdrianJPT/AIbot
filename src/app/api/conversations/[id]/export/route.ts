import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

const SENDER_LABEL: Record<string, string> = {
  customer: "Cliente",
  bot: "Bot",
  human: "Agente",
};

function formatLine(sender: string, createdAt: Date, content: string): string {
  const stamp = createdAt.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `[${stamp}] ${sender}: ${content}`;
}

/**
 * Exports a full conversation as a WhatsApp-style `.txt` transcript
 * (`[dd/mm/yy, HH:MM] Sender: message`, chronological, no pagination —
 * conversations are small enough that this is fine as a one-shot download).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const conversation = await prisma.conversation.findFirst({
    where: { id, business: { ownerId: user.id } },
  });
  if (!conversation) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
  });

  const lines = messages.map((m) =>
    formatLine(SENDER_LABEL[m.sentBy] ?? m.sentBy, m.createdAt, m.content)
  );
  const body = lines.join("\n") + (lines.length ? "\n" : "");

  const name = conversation.customerName || conversation.customerPhone;
  const filename = `conversacion-${name.replace(/[^a-z0-9]+/gi, "-")}.txt`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
