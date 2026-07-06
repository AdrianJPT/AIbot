import { NextResponse } from "next/server";

/**
 * Public healthcheck for Railway's deploy healthcheck (`railway.json`).
 * No auth — mirrors `/api/webhook` in the middleware's excluded matcher.
 *
 * This is a liveness probe only. It must stay fast and independent from the
 * database so Railway can mark the process healthy even if Prisma or the DB
 * is still warming up.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
  });
}
