import { NextResponse } from "next/server";

/**
 * Public healthcheck for Cloud Run's startup/liveness probe.
 * No auth — mirrors `/api/webhook` in the proxy's excluded matcher.
 *
 * This is a liveness probe only. It must stay fast and independent from the
 * database so Cloud Run can mark the process healthy even if Prisma or the DB
 * is still warming up.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
  });
}
