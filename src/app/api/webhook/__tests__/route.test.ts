import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { textMessagePayload } from "@/lib/__tests__/fixtures/webhook-payload";

const processWebhookPayload = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/message-handler", () => ({
  processWebhookPayload: (...args: unknown[]) => processWebhookPayload(...args),
}));

const APP_SECRET = "test-app-secret";

function signBody(rawBody: string): string {
  const hex = createHmac("sha256", APP_SECRET).update(rawBody, "utf8").digest("hex");
  return `sha256=${hex}`;
}

function buildRequest(rawBody: string, signature?: string | null): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature) headers["x-hub-signature-256"] = signature;
  return new NextRequest("https://example.com/api/webhook", {
    method: "POST",
    body: rawBody,
    headers,
  });
}

describe("POST /api/webhook", () => {
  const originalSecret = process.env.WHATSAPP_APP_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WHATSAPP_APP_SECRET = APP_SECRET;
  });

  afterAll(() => {
    process.env.WHATSAPP_APP_SECRET = originalSecret;
  });

  it("returns 200 and processes the payload when the signature is valid", async () => {
    const { POST } = await import("../route");
    const rawBody = JSON.stringify(textMessagePayload);
    const req = buildRequest(rawBody, signBody(rawBody));

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(processWebhookPayload).toHaveBeenCalledWith(textMessagePayload);
  });

  it("returns 401 and does not process the payload when the signature is missing", async () => {
    const { POST } = await import("../route");
    const rawBody = JSON.stringify(textMessagePayload);
    const req = buildRequest(rawBody, null);

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  it("returns 401 and does not process the payload when the signature is invalid", async () => {
    const { POST } = await import("../route");
    const rawBody = JSON.stringify(textMessagePayload);
    const req = buildRequest(rawBody, "sha256=deadbeef");

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });
});
