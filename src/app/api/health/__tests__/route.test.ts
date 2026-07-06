import { describe, expect, it } from "vitest";
import { GET } from "../route";

describe("GET /api/health", () => {
  it("returns 200 with a lightweight liveness response", async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body).not.toHaveProperty("db");
    expect(body).not.toHaveProperty("lastWebhookReceivedAt");
  });
});
