import { NextRequest, NextResponse } from "next/server";
import { processWebhookPayload } from "@/lib/message-handler";

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    void processWebhookPayload(body).catch((e) =>
      console.error("Webhook process error:", e)
    );
  } catch (e) {
    console.error("Webhook parse error:", e);
  }
  return NextResponse.json({ ok: true });
}
