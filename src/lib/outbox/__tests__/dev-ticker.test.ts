import { beforeEach, describe, expect, it, vi } from "vitest";

const runDrain = vi.fn();
vi.mock("../drain", () => ({
  runDrain: (...args: unknown[]) => runDrain(...args),
}));

const logEvent = vi.fn();
vi.mock("../../log", () => ({
  logEvent: (...args: unknown[]) => logEvent(...args),
}));

describe("startDevDrainTicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The module has a module-level `started` guard (mirrors the old
    // reply-window scheduler this replaces) — reset the module registry
    // each test so it doesn't leak across tests (mocks above stay active,
    // vi.mock factories are hoisted and re-applied to the fresh instance).
    vi.resetModules();
    runDrain.mockResolvedValue({
      claimed: 0,
      processed: 0,
      failed: 0,
      remaining: false,
    });
    logEvent.mockResolvedValue(undefined);
  });

  it("calls runDrain() directly on an interval — no HTTP, no token", async () => {
    vi.useFakeTimers();
    const { startDevDrainTicker } = await import("../dev-ticker");

    startDevDrainTicker();
    await vi.advanceTimersByTimeAsync(3000);

    expect(runDrain).toHaveBeenCalledWith();

    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("is a no-op to call twice — only one interval loop runs (module-level guard)", async () => {
    vi.useFakeTimers();
    const { startDevDrainTicker } = await import("../dev-ticker");

    const before = vi.getTimerCount();
    startDevDrainTicker();
    const afterFirst = vi.getTimerCount();
    startDevDrainTicker();
    const afterSecond = vi.getTimerCount();

    expect(afterFirst).toBe(before + 1);
    expect(afterSecond).toBe(afterFirst);

    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("logs and does not throw when runDrain() rejects", async () => {
    vi.useFakeTimers();
    runDrain.mockRejectedValueOnce(new Error("db unreachable"));
    const { startDevDrainTicker } = await import("../dev-ticker");

    startDevDrainTicker();
    await vi.advanceTimersByTimeAsync(3000);

    expect(logEvent).toHaveBeenCalledWith(
      "error",
      "webhook",
      "Dev drain ticker failed",
      expect.objectContaining({ error: "db unreachable" }),
    );

    vi.clearAllTimers();
    vi.useRealTimers();
  });
});
