import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupOwnershipFixtures,
  createTestBusiness,
  createTestConversation,
  createTestMessage,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";
import { deliveryHealth, volumeByDay } from "../repository";

const ownerIds: string[] = [];

afterEach(async () => {
  await cleanupOwnershipFixtures(ownerIds.splice(0));
});

/** Midnight UTC, `offsetDays` days from today (negative = past, positive = future). */
function utcMidnight(offsetDays: number): Date {
  const now = new Date();
  const todayMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return new Date(todayMidnight + offsetDays * 24 * 60 * 60 * 1000);
}

/**
 * A bounded `[start, end)` range of exactly `days` whole UTC calendar days,
 * ending at tomorrow's UTC midnight — so "today" (and therefore a fixture
 * row's default `createdAt`, DB `now()`) always falls inside it regardless
 * of when the suite runs, and every boundary stays midnight-aligned so
 * `volumeByDay`'s day count is deterministic.
 */
function testRange(days: number) {
  return { start: utcMidnight(1 - days), end: utcMidnight(1) };
}

async function setupOwnerWithConversation(prefix: string) {
  const owner = await createTestUser(prefix);
  ownerIds.push(owner.id);
  const business = await createTestBusiness(owner.id, prefix);
  const conversation = await createTestConversation(business.id, prefix);
  return { owner, business, conversation };
}

describe("deliveryHealth", () => {
  it("returns all-zero counts and a zero failure rate when nothing failed", async () => {
    const { owner, conversation } = await setupOwnerWithConversation("dh-none");
    await createTestMessage(conversation.id, { sentBy: "bot", status: "sent" });
    await createTestMessage(conversation.id, {
      sentBy: "customer",
      status: "sent",
    });

    const result = await deliveryHealth(owner, testRange(7));

    expect(result.totalFailed).toBe(0);
    expect(result.failureRate).toBe(0);
    expect(result.byCode).toEqual({
      window_expired: 0,
      auth: 0,
      rate_limit: 0,
      invalid_recipient: 0,
      unknown: 0,
    });
  });

  it("counts a null or unrecognized failureCode under unknown instead of dropping it", async () => {
    const { owner, conversation } = await setupOwnerWithConversation("dh-unk");
    await createTestMessage(conversation.id, {
      sentBy: "bot",
      status: "failed",
      failureCode: null,
    });
    await createTestMessage(conversation.id, {
      sentBy: "bot",
      status: "failed",
      failureCode: "some_legacy_code_no_longer_mapped",
    });
    await createTestMessage(conversation.id, {
      sentBy: "human",
      status: "failed",
      failureCode: "auth",
    });
    await createTestMessage(conversation.id, { sentBy: "bot", status: "sent" });

    const result = await deliveryHealth(owner, testRange(7));

    expect(result.byCode.unknown).toBe(2);
    expect(result.byCode.auth).toBe(1);
    expect(result.totalFailed).toBe(3);
    expect(result.totalOutbound).toBe(4);
    expect(result.failureRate).toBe(3 / 4);
  });

  it("never lets a second tenant's failures into the first tenant's totals", async () => {
    const { owner: owner1, conversation: conversation1 } =
      await setupOwnerWithConversation("dh-tenant-a");
    const { conversation: conversation2 } =
      await setupOwnerWithConversation("dh-tenant-b");

    await createTestMessage(conversation1.id, {
      sentBy: "bot",
      status: "failed",
      failureCode: "auth",
    });
    await createTestMessage(conversation2.id, {
      sentBy: "bot",
      status: "failed",
      failureCode: "rate_limit",
    });
    await createTestMessage(conversation2.id, {
      sentBy: "bot",
      status: "failed",
      failureCode: "rate_limit",
    });

    const result = await deliveryHealth(owner1, testRange(7));

    expect(result.totalFailed).toBe(1);
    expect(result.byCode.auth).toBe(1);
    expect(result.byCode.rate_limit).toBe(0);
  });
});

describe("volumeByDay", () => {
  it("renders a UTC day with no traffic as a zero bucket, not omitted", async () => {
    const { owner, conversation } = await setupOwnerWithConversation("vol-gap");
    const range = testRange(2); // two UTC days: only the earlier one gets traffic
    await createTestMessage(conversation.id, {
      sentBy: "customer",
      createdAt: range.start,
    });

    const buckets = await volumeByDay(owner, range);

    expect(buckets).toHaveLength(2);
    expect(buckets[0].inbound).toBe(1);
    expect(buckets[1]).toEqual({
      day: buckets[1].day,
      inbound: 0,
      outbound: 0,
    });
  });

  it("never lets a second tenant's traffic into the first tenant's day buckets", async () => {
    const { owner: owner1, conversation: conversation1 } =
      await setupOwnerWithConversation("vol-tenant-a");
    const { conversation: conversation2 } =
      await setupOwnerWithConversation("vol-tenant-b");
    const range = testRange(1);

    await createTestMessage(conversation1.id, {
      sentBy: "customer",
      createdAt: range.start,
    });
    await createTestMessage(conversation2.id, {
      sentBy: "customer",
      createdAt: range.start,
    });
    await createTestMessage(conversation2.id, {
      sentBy: "bot",
      createdAt: range.start,
    });

    const buckets = await volumeByDay(owner1, range);

    expect(buckets).toHaveLength(1);
    expect(buckets[0].inbound).toBe(1);
    expect(buckets[0].outbound).toBe(0);
  });
});

describe("raw SQL safety (task 2.11)", () => {
  it("builds every raw query with tagged-template interpolation, never Prisma.raw or an unsafe query", () => {
    const source = readFileSync(
      path.join(__dirname, "../repository.ts"),
      "utf-8",
    );

    expect(source).toMatch(/\$queryRaw(<[^>]*>)?`/);
    expect(source).not.toMatch(/Prisma\.raw\(/);
    expect(source).not.toMatch(/\$queryRawUnsafe/);
    expect(source).not.toMatch(/\$executeRawUnsafe/);
  });
});
