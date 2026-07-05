import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Public healthcheck for Railway's deploy healthcheck (`railway.json`).
 * No auth — mirrors `/api/webhook` in the middleware's excluded matcher.
 *
 * Pings the DB with a trivial query and reports the most recent inbound
 * webhook activity (latest Message row, falling back to the latest EventLog
 * row so a freshly deployed instance with no traffic yet still reports
 * `null` instead of erroring).
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    const [lastMessage, lastEvent] = await Promise.all([
      prisma.message.findFirst({
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.eventLog.findFirst({
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);

    return NextResponse.json({
      status: "ok",
      db: "ok",
      lastWebhookReceivedAt: lastMessage?.createdAt ?? lastEvent?.createdAt ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        db: "error",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 503 }
    );
  }
}
