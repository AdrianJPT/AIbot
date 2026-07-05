import { describe, expect, it } from "vitest";
import { aggregateBusinessActivity } from "@/lib/business-activity";

describe("aggregateBusinessActivity", () => {
  it("returns zeros and null lastActivityAt for no conversations", () => {
    expect(aggregateBusinessActivity([])).toEqual({
      conversationsCount: 0,
      unreadCount: 0,
      lastActivityAt: null,
    });
  });

  it("sums unreadCount and picks the most recent lastMessageAt", () => {
    const older = new Date("2026-01-01T00:00:00Z");
    const newer = new Date("2026-02-01T00:00:00Z");

    const result = aggregateBusinessActivity([
      { unreadCount: 2, lastMessageAt: older },
      { unreadCount: 3, lastMessageAt: newer },
    ]);

    expect(result).toEqual({
      conversationsCount: 2,
      unreadCount: 5,
      lastActivityAt: newer,
    });
  });
});
