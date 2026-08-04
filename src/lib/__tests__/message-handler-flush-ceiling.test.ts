import { describe, expect, it } from "vitest";
import { computeFlushDueAt, maxBatchAgeMs } from "../message-handler";

/**
 * `replyWindowMs` is a debounce, and an unbounded debounce has a hole in it: a
 * customer who keeps sending bubbles faster than the window pushes
 * `pendingFlushAt` forward on every message, so the sweep never finds the
 * conversation due and the reply never arrives at all. The bug is latent while
 * `replyWindowMs` is 0 (the default) and activates the moment an operator sets
 * a window in the admin form — i.e. exactly when batching starts being used.
 *
 * These are pure-arithmetic tests on the due-time computation. The surrounding
 * ingest behaviour (that ingest never calls the AI or sends, and writes the due
 * time to the right conversation) is covered in
 * message-handler-reply-window.test.ts; the dispatch side is covered in
 * reply-window-scheduler.test.ts and dispatch-resumability.test.ts.
 */
describe("maxBatchAgeMs", () => {
  it("derives the worst case from the configured window rather than a fixed constant", () => {
    expect(maxBatchAgeMs(5_000)).toBe(20_000);
    expect(maxBatchAgeMs(1_000)).toBe(4_000);
  });

  it("caps the worst case at 60s even for the admin form's 300s maximum", () => {
    expect(maxBatchAgeMs(300_000)).toBe(60_000);
    // 15s is the largest window whose 4x multiple is still under the cap.
    expect(maxBatchAgeMs(15_000)).toBe(60_000);
    expect(maxBatchAgeMs(14_000)).toBe(56_000);
  });

  it("collapses to zero when batching is disabled", () => {
    expect(maxBatchAgeMs(0)).toBe(0);
  });
});

describe("computeFlushDueAt", () => {
  const now = 1_000_000;

  it("uses the plain debounce while the ceiling does not bind", () => {
    // One message, just arrived: anchor is that message, so the ceiling sits at
    // anchor + 20s while the debounce is only anchor + 5s.
    expect(computeFlushDueAt(5_000, new Date(now), now).getTime()).toBe(
      now + 5_000,
    );
  });

  it("stops a customer who keeps typing from postponing the reply forever", () => {
    // The burst's first message is the anchor and never moves; `now` advances
    // with each new bubble. Without the clamp every one of these would return
    // `now + 5_000` and the reply would never come due.
    const burstStartedAt = new Date(now);
    const ceiling = now + 20_000;

    // 3s in: still debouncing normally.
    expect(
      computeFlushDueAt(5_000, burstStartedAt, now + 3_000).getTime(),
    ).toBe(now + 8_000);

    // 16s in: the debounce would reach 21s, past the ceiling — clamped.
    expect(
      computeFlushDueAt(5_000, burstStartedAt, now + 16_000).getTime(),
    ).toBe(ceiling);

    // 40s in: still the same ceiling, already in the past, so the sweep finds
    // it due on the next tick instead of waiting another window.
    const late = computeFlushDueAt(5_000, burstStartedAt, now + 40_000);
    expect(late.getTime()).toBe(ceiling);
    expect(late.getTime()).toBeLessThan(now + 40_000);
  });

  it("never returns a due time later than the ceiling, however long the burst runs", () => {
    const burstStartedAt = new Date(now);
    for (let elapsed = 0; elapsed <= 120_000; elapsed += 2_500) {
      const dueAt = computeFlushDueAt(
        5_000,
        burstStartedAt,
        now + elapsed,
      ).getTime();
      expect(dueAt).toBeLessThanOrEqual(now + 20_000);
    }
  });

  it("keeps replyWindowMs = 0 exactly immediate, matching today's behaviour", () => {
    // Backward compatibility for the default configuration: the anchor is
    // ignored entirely, so this can never resolve to a past-or-future skew.
    expect(computeFlushDueAt(0, new Date(now - 90_000), now).getTime()).toBe(
      now,
    );
    expect(computeFlushDueAt(0, null, now).getTime()).toBe(now);
  });

  it("falls back to the plain debounce when nothing is awaiting an answer", () => {
    // Null anchor means a concurrent flush already claimed the batch (or the
    // caller skipped the lookup). Nothing can starve, so no clamp applies.
    expect(computeFlushDueAt(5_000, null, now).getTime()).toBe(now + 5_000);
  });

  it("clamps to the ceiling for a window whose 4x multiple exceeds the 60s cap", () => {
    // 30s window: the ceiling is the 60s cap, not 120s.
    const burstStartedAt = new Date(now);
    expect(
      computeFlushDueAt(30_000, burstStartedAt, now + 45_000).getTime(),
    ).toBe(now + 60_000);
  });
});
