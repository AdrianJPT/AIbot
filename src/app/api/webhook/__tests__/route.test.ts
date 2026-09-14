import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { textMessagePayload } from "@/lib/__tests__/fixtures/webhook-payload";

const enqueue = vi.fn();
vi.mock("@/lib/outbox/repository", () => ({
  enqueue: (...args: unknown[]) => enqueue(...args),
}));

const runDrain = vi.fn();
vi.mock("@/lib/outbox/drain", () => ({
  runDrain: (...args: unknown[]) => runDrain(...args),
}));

const APP_SECRET = "test-app-secret";

function signBody(rawBody: string): string {
  const hex = createHmac("sha256", APP_SECRET)
    .update(rawBody, "utf8")
    .digest("hex");
  return `sha256=${hex}`;
}

function buildRequest(rawBody: string, signature?: string | null): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
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
    enqueue.mockResolvedValue({ id: "evt_1" });
    runDrain.mockResolvedValue({
      claimed: 1,
      processed: 1,
      failed: 0,
      remaining: false,
    });
  });

  afterAll(() => {
    process.env.WHATSAPP_APP_SECRET = originalSecret;
  });

  it("persists exactly once and drains inline when the signature is valid", async () => {
    const { POST } = await import("../route");
    const rawBody = JSON.stringify(textMessagePayload);
    const req = buildRequest(rawBody, signBody(rawBody));

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledWith(rawBody);
    expect(runDrain).toHaveBeenCalledWith({
      eventId: "evt_1",
      budgetMs: 12_000,
    });
  });

  it("a verified body is enqueued with rawPayload set and payload left null, before any JSON.parse", async () => {
    // A body that is signature-valid but NOT valid JSON. If the route still
    // called JSON.parse before enqueue (the old durability boundary), this
    // would throw before enqueue ever runs. Enqueue receiving the raw string
    // verbatim and the request still succeeding proves parsing moved out of
    // the route entirely — the raw text is the durability boundary now, not
    // a parsed `payload`.
    const { POST } = await import("../route");
    const rawBody = "not valid json, but signed";
    const req = buildRequest(rawBody, signBody(rawBody));

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledWith(rawBody);
    expect(runDrain).toHaveBeenCalledWith({
      eventId: "evt_1",
      budgetMs: 12_000,
    });
  });

  it("propagates an enqueue failure instead of acknowledging the payload", async () => {
    const { POST } = await import("../route");
    const rawBody = JSON.stringify(textMessagePayload);
    const req = buildRequest(rawBody, signBody(rawBody));
    enqueue.mockRejectedValue(new Error("connection terminated"));

    // Nothing was persisted, so the handler must not return 200 — Next turns
    // the throw into a 5xx and Meta redelivers.
    await expect(POST(req)).rejects.toThrow("connection terminated");
    expect(runDrain).not.toHaveBeenCalled();
  });

  it("returns 401 and does not persist when the signature is missing", async () => {
    const { POST } = await import("../route");
    const rawBody = JSON.stringify(textMessagePayload);
    const req = buildRequest(rawBody, null);

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(enqueue).not.toHaveBeenCalled();
    expect(runDrain).not.toHaveBeenCalled();
  });

  it("returns 401 and does not persist when the signature is invalid", async () => {
    const { POST } = await import("../route");
    const rawBody = JSON.stringify(textMessagePayload);
    const req = buildRequest(rawBody, "sha256=deadbeef");

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(enqueue).not.toHaveBeenCalled();
    expect(runDrain).not.toHaveBeenCalled();
  });

  it("still returns 200 and durably enqueues the raw body when it is malformed JSON", async () => {
    const { POST } = await import("../route");
    const rawBody = "not json";
    const req = buildRequest(rawBody, signBody(rawBody));

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledWith(rawBody);
  });

  it("still returns 200 when the inline drain throws", async () => {
    runDrain.mockRejectedValueOnce(new Error("db unreachable"));
    const { POST } = await import("../route");
    const rawBody = JSON.stringify(textMessagePayload);
    const req = buildRequest(rawBody, signBody(rawBody));

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(enqueue).toHaveBeenCalledOnce();
  });
});
