import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runDrain } from "@/lib/outbox/drain";

/**
 * Shared-secret auth, mirroring `webhook/route.ts`'s HMAC check: read both
 * sides as buffers, reject on length mismatch before `timingSafeEqual`
 * (which throws on unequal-length buffers), never branch on the token
 * itself before the constant-time compare.
 */
function isAuthorized(req: NextRequest): boolean {
  const provided = req.headers.get("x-internal-token");
  const expected = process.env.INTERNAL_DRAIN_TOKEN;
  if (!provided || !expected) return false;

  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Authenticated safety-net drain — the scheduled replacement for the old
 * per-process `setInterval`. Not the primary reply path (the webhook awaits
 * an inline drain of its own event); this exists to retry rows a crashed or
 * timed-out inline attempt left behind.
 *
 * POST only — GET (and every other method) gets Next's built-in 405 for
 * routes that don't export a handler for it. Keeps this out of caches and
 * unreachable by a browser prefetch.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDrain({ batchSize: 10, budgetMs: 50_000 });
  return NextResponse.json({ ok: true, ...result });
}
