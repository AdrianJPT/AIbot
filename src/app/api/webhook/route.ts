import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { enqueue } from "@/lib/outbox/repository";
import { runDrain } from "@/lib/outbox/drain";
import { logEvent } from "@/lib/log";

function isValidSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;

  const [scheme, providedHex] = signatureHeader.split("=");
  if (scheme !== "sha256" || !providedHex) return false;

  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return false;

  const expectedHex = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  const provided = Buffer.from(providedHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");
  if (provided.length !== expected.length) return false;

  return timingSafeEqual(provided, expected);
}

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === process.env.WEBHOOK_VERIFY_TOKEN &&
    challenge
  ) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Meta allows ~20s before it considers the webhook timed out and redelivers.
 * 12s leaves margin for TLS, cold start, and returning the 200 itself — see
 * design.md §5 "Inline budget on the webhook path".
 */
const INLINE_DRAIN_BUDGET_MS = 12_000;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!isValidSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch (err) {
    // HMAC already verified above, so this genuinely came from Meta — a
    // malformed body that passed signature verification will never parse on
    // redelivery either. Returning 400 here would make Meta retry forever;
    // swallow, log, and return 200, matching today's behavior.
    await logEvent(
      "error",
      "webhook",
      "Malformed JSON body after signature verification",
      { error: err instanceof Error ? err.message : String(err) },
    );
    return NextResponse.json({ ok: true });
  }

  // Durability boundary: once this resolves, the payload survives even if
  // nothing below it ever runs. An INSERT failure here is left to throw —
  // Next.js turns it into a 5xx so Meta redelivers, since nothing was
  // persisted.
  const event = await enqueue(body);

  try {
    // Awaited so the reply goes out before the 200 when it can (matches
    // today's customer-visible latency); the internal drain endpoint is the
    // safety net for whatever this doesn't finish in time.
    await runDrain({ eventId: event.id, budgetMs: INLINE_DRAIN_BUDGET_MS });
  } catch (err) {
    // The event is already durable — an inline failure here must not turn
    // into a 5xx (that would make Meta redeliver a payload we've already
    // got). The sweep/next drain retries it.
    console.error("Webhook inline drain error:", err);
  }

  return NextResponse.json({ ok: true });
}
