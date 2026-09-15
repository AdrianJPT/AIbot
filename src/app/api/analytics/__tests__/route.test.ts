import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSessionUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  getSessionUser: () => getSessionUser(),
}));

const deliveryHealth = vi.fn();
const volumeByDay = vi.fn();
const responseTimeByDay = vi.fn();
const tokenUsage = vi.fn();
vi.mock("@/lib/analytics/repository", () => ({
  deliveryHealth: (...args: unknown[]) => deliveryHealth(...args),
  volumeByDay: (...args: unknown[]) => volumeByDay(...args),
  responseTimeByDay: (...args: unknown[]) => responseTimeByDay(...args),
  tokenUsage: (...args: unknown[]) => tokenUsage(...args),
}));

function buildRequest(query = ""): NextRequest {
  return new NextRequest(`https://example.com/api/analytics${query}`);
}

const emptyHealth = {
  byCode: {
    window_expired: 0,
    auth: 0,
    rate_limit: 0,
    invalid_recipient: 0,
    unknown: 0,
  },
  totalOutbound: 0,
  totalFailed: 0,
  failureRate: 0,
};
const emptyUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  sampleCount: 0,
};
const scopedUser = { id: "u1", role: "client" };

describe("GET /api/analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deliveryHealth.mockResolvedValue(emptyHealth);
    volumeByDay.mockResolvedValue([]);
    responseTimeByDay.mockResolvedValue([]);
    tokenUsage.mockResolvedValue(emptyUsage);
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const { GET } = await import("../route");

    const res = await GET(buildRequest());

    expect(res.status).toBe(401);
    expect(deliveryHealth).not.toHaveBeenCalled();
  });

  it("rejects a range value outside 7d|30d — never open-ended", async () => {
    getSessionUser.mockResolvedValueOnce(scopedUser);
    const { GET } = await import("../route");

    const res = await GET(buildRequest("?range=1y"));

    expect(res.status).toBe(400);
    expect(deliveryHealth).not.toHaveBeenCalled();
  });

  it("defaults to the most recent 30 UTC days when no range is given", async () => {
    getSessionUser.mockResolvedValueOnce(scopedUser);
    const { GET } = await import("../route");

    const res = await GET(buildRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.range.key).toBe("30d");
    const [, range] = deliveryHealth.mock.calls[0] as [
      unknown,
      { start: Date; end: Date },
    ];
    const days = (range.end.getTime() - range.start.getTime()) / 86_400_000;
    expect(days).toBe(30);
  });

  it("resolves range=7d and passes the identical scoped user and range to every metric", async () => {
    getSessionUser.mockResolvedValueOnce(scopedUser);
    const { GET } = await import("../route");

    const res = await GET(buildRequest("?range=7d"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.range.key).toBe("7d");
    expect(body.deliveryHealth).toEqual(emptyHealth);
    expect(body.tokenUsage).toEqual(emptyUsage);

    const [user1, range1] = deliveryHealth.mock.calls[0];
    const [user2, range2] = tokenUsage.mock.calls[0];
    expect(user1).toEqual(scopedUser);
    expect(user2).toEqual(scopedUser);
    expect(range1).toEqual(range2);
  });
});
