import { beforeEach, describe, expect, it, vi } from "vitest";

const expireStale = vi.fn();
const claimBatch = vi.fn();
const complete = vi.fn();
const fail = vi.fn();
vi.mock("../repository", () => ({ expireStale, claimBatch, complete, fail }));

const processWebhookPayload = vi.fn();
vi.mock("../../message-handler", () => ({
  processWebhookPayload: (...args: unknown[]) => processWebhookPayload(...args),
}));

describe("outbox/drain runDrain", () => {
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks) — also clears any queued
    // mockResolvedValueOnce() implementations left over from a previous
    // test's unconsumed queue, which would otherwise leak into this one.
    vi.resetAllMocks();
    expireStale.mockResolvedValue(undefined);
    complete.mockResolvedValue(undefined);
    fail.mockResolvedValue(undefined);
    processWebhookPayload.mockResolvedValue(undefined);
  });

  it("always reaps orphaned leases before claiming", async () => {
    claimBatch.mockResolvedValueOnce([]);
    const { runDrain } = await import("../drain");

    await runDrain();

    expect(expireStale).toHaveBeenCalledOnce();
  });

  it("stops without claiming when the budget is already exhausted", async () => {
    const { runDrain } = await import("../drain");

    const result = await runDrain({ budgetMs: -1 });

    expect(claimBatch).not.toHaveBeenCalled();
    expect(result).toEqual({
      claimed: 0,
      processed: 0,
      failed: 0,
      remaining: true,
    });
  });

  it("claims, processes, and completes pending events until the queue is empty", async () => {
    claimBatch
      .mockResolvedValueOnce([{ id: "evt_1", payload: { a: 1 } }])
      .mockResolvedValueOnce([]);
    const { runDrain } = await import("../drain");

    const result = await runDrain({ budgetMs: 50_000, batchSize: 10 });

    expect(processWebhookPayload).toHaveBeenCalledWith({ a: 1 });
    expect(complete).toHaveBeenCalledWith("evt_1");
    expect(fail).not.toHaveBeenCalled();
    expect(result).toEqual({
      claimed: 1,
      processed: 1,
      failed: 0,
      remaining: false,
    });
  });

  it("marks a processing failure as failed and keeps going", async () => {
    processWebhookPayload.mockRejectedValueOnce(new Error("boom"));
    claimBatch.mockResolvedValueOnce([{ id: "evt_2", payload: {} }]);
    const { runDrain } = await import("../drain");

    const result = await runDrain();

    expect(fail).toHaveBeenCalledWith("evt_2", "boom");
    expect(complete).not.toHaveBeenCalled();
    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("stops mid-batch and reports remaining:true when the budget runs out", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    claimBatch.mockResolvedValueOnce([
      { id: "evt_3", payload: {} },
      { id: "evt_4", payload: {} },
    ]);
    processWebhookPayload.mockImplementationOnce(async () => {
      now = 100; // blow the budget after the first event in the batch
    });
    const { runDrain } = await import("../drain");

    const result = await runDrain({ budgetMs: 50 });

    expect(processWebhookPayload).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith("evt_3");
    expect(fail).toHaveBeenCalledWith(
      "evt_4",
      "drain budget exceeded before processing",
    );
    expect(result.remaining).toBe(true);

    vi.restoreAllMocks();
  });

  it("scopes claimBatch to eventId and stops after one pass when given", async () => {
    claimBatch.mockResolvedValueOnce([{ id: "evt_5", payload: {} }]);
    const { runDrain } = await import("../drain");

    await runDrain({ eventId: "evt_5", budgetMs: 12_000 });

    expect(claimBatch).toHaveBeenCalledTimes(1);
    expect(claimBatch).toHaveBeenCalledWith(
      10,
      90,
      expect.any(String),
      "evt_5",
    );
  });
});
