import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const runDrain = vi.fn();
vi.mock("@/lib/outbox/drain", () => ({
  runDrain: (...args: unknown[]) => runDrain(...args),
}));

const runAnalysisDrain = vi.fn();
vi.mock("@/lib/payments/analysis-job", () => ({
  runAnalysisDrain: (...args: unknown[]) => runAnalysisDrain(...args),
}));

const TOKEN = "test-internal-drain-token";

function buildRequest(method: string, token?: string | null): NextRequest {
  const headers: Record<string, string> = {};
  if (token) headers["x-internal-token"] = token;
  return new NextRequest("https://example.com/api/internal/drain", {
    method,
    headers,
  });
}

describe("POST /api/internal/drain", () => {
  const originalToken = process.env.INTERNAL_DRAIN_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_DRAIN_TOKEN = TOKEN;
    runDrain.mockResolvedValue({
      claimed: 3,
      processed: 2,
      failed: 1,
      remaining: false,
    });
    runAnalysisDrain.mockResolvedValue({
      claimed: 1,
      processed: 1,
      failed: 0,
      remaining: false,
    });
  });

  afterAll(() => {
    process.env.INTERNAL_DRAIN_TOKEN = originalToken;
  });

  it("returns 401 and does not drain when the token header is missing", async () => {
    const { POST } = await import("../route");

    const res = await POST(buildRequest("POST"));

    expect(res.status).toBe(401);
    expect(runDrain).not.toHaveBeenCalled();
    expect(runAnalysisDrain).not.toHaveBeenCalled();
  });

  it("returns 401 and does not drain when the token is invalid", async () => {
    const { POST } = await import("../route");

    const res = await POST(buildRequest("POST", "wrong-token"));

    expect(res.status).toBe(401);
    expect(runDrain).not.toHaveBeenCalled();
    expect(runAnalysisDrain).not.toHaveBeenCalled();
  });

  it("returns a summary and invokes both the webhook and payment-analysis drains when the token is valid", async () => {
    const { POST } = await import("../route");

    const res = await POST(buildRequest("POST", TOKEN));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(runDrain).toHaveBeenCalledWith({ batchSize: 10, budgetMs: 50_000 });
    expect(runAnalysisDrain).toHaveBeenCalledWith({
      batchSize: 10,
      budgetMs: 50_000,
    });
    expect(body).toEqual({
      ok: true,
      claimed: 3,
      processed: 2,
      failed: 1,
      remaining: false,
      payments: { claimed: 1, processed: 1, failed: 0, remaining: false },
    });
  });

  it("exports no GET handler, so Next.js returns 405 for it", async () => {
    const routeModule: Record<string, unknown> = await import("../route");

    expect(routeModule.GET).toBeUndefined();
  });
});
