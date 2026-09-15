import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  cleanupOwnershipFixtures,
  createTestBusiness,
  createTestConversation,
  createTestMessage,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";
import {
  billableChatsByPhoneNumber,
  deliveryHealth,
  responseTimeByDay,
  tokenUsage,
  volumeByDay,
} from "../repository";

const DAY_MS = 24 * 60 * 60 * 1000;

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

describe("responseTimeByDay", () => {
  it("excludes a customer message with no later outbound reply, instead of counting it as zero-duration", async () => {
    const { owner, conversation } = await setupOwnerWithConversation("rt-none");
    const range = testRange(1);
    // Customer message with no reply at all in the conversation.
    await createTestMessage(conversation.id, {
      sentBy: "customer",
      createdAt: range.start,
    });

    const buckets = await responseTimeByDay(owner, range);

    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toEqual({
      day: buckets[0].day,
      avgMs: null,
      sampleCount: 0,
    });
  });

  it("computes the elapsed time to the next outbound reply in the same conversation", async () => {
    const { owner, conversation } =
      await setupOwnerWithConversation("rt-reply");
    const range = testRange(1);
    const customerAt = range.start;
    const replyAt = new Date(customerAt.getTime() + 60_000); // 1 minute later
    await createTestMessage(conversation.id, {
      sentBy: "customer",
      createdAt: customerAt,
    });
    await createTestMessage(conversation.id, {
      sentBy: "bot",
      createdAt: replyAt,
    });

    const buckets = await responseTimeByDay(owner, range);

    expect(buckets).toHaveLength(1);
    expect(buckets[0].sampleCount).toBe(1);
    expect(buckets[0].avgMs).toBe(60_000);
  });

  it("never lets a second tenant's reply times into the first tenant's buckets", async () => {
    const { owner: owner1, conversation: conversation1 } =
      await setupOwnerWithConversation("rt-tenant-a");
    const { conversation: conversation2 } =
      await setupOwnerWithConversation("rt-tenant-b");
    const range = testRange(1);

    await createTestMessage(conversation1.id, {
      sentBy: "customer",
      createdAt: range.start,
    });
    await createTestMessage(conversation1.id, {
      sentBy: "bot",
      createdAt: new Date(range.start.getTime() + 30_000),
    });
    await createTestMessage(conversation2.id, {
      sentBy: "customer",
      createdAt: range.start,
    });
    await createTestMessage(conversation2.id, {
      sentBy: "bot",
      createdAt: new Date(range.start.getTime() + 999_000),
    });

    const buckets = await responseTimeByDay(owner1, range);

    expect(buckets[0].sampleCount).toBe(1);
    expect(buckets[0].avgMs).toBe(30_000);
  });
});

describe("tokenUsage", () => {
  it("sums promptTokens/completionTokens/totalTokens across ai-usage EventLog rows in range", async () => {
    const { owner, business } = await setupOwnerWithConversation("tok-sum");
    const range = testRange(7);
    await prisma.eventLog.create({
      data: {
        level: "info",
        source: "ai-usage",
        message: "AI call token usage",
        businessId: business.id,
        detail: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
      },
    });
    await prisma.eventLog.create({
      data: {
        level: "info",
        source: "ai-usage",
        message: "AI call token usage",
        businessId: business.id,
        detail: { promptTokens: 50, completionTokens: 5, totalTokens: 55 },
      },
    });

    const result = await tokenUsage(owner, range);

    expect(result).toEqual({
      promptTokens: 150,
      completionTokens: 25,
      totalTokens: 175,
      sampleCount: 2,
    });
  });

  it("skips an ai-usage row with no usage block instead of counting it as a zero sample", async () => {
    const { owner, business } = await setupOwnerWithConversation("tok-noblock");
    const range = testRange(7);
    await prisma.eventLog.create({
      data: {
        level: "info",
        source: "ai-usage",
        message: "AI call returned no usage block",
        businessId: business.id,
        detail: { conversationId: "conv_1", model: "gpt-4o-mini" },
      },
    });
    await prisma.eventLog.create({
      data: {
        level: "info",
        source: "ai-usage",
        message: "AI call token usage",
        businessId: business.id,
        detail: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
      },
    });

    const result = await tokenUsage(owner, range);

    expect(result).toEqual({
      promptTokens: 10,
      completionTokens: 2,
      totalTokens: 12,
      sampleCount: 1,
    });
  });

  it("never lets a second tenant's ai-usage rows into the first tenant's totals", async () => {
    const { owner: owner1, business: business1 } =
      await setupOwnerWithConversation("tok-tenant-a");
    const { business: business2 } =
      await setupOwnerWithConversation("tok-tenant-b");
    const range = testRange(7);
    await prisma.eventLog.create({
      data: {
        level: "info",
        source: "ai-usage",
        message: "AI call token usage",
        businessId: business1.id,
        detail: { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
      },
    });
    await prisma.eventLog.create({
      data: {
        level: "info",
        source: "ai-usage",
        message: "AI call token usage",
        businessId: business2.id,
        detail: { promptTokens: 999, completionTokens: 999, totalTokens: 1998 },
      },
    });

    const result = await tokenUsage(owner1, range);

    expect(result).toEqual({
      promptTokens: 10,
      completionTokens: 1,
      totalTokens: 11,
      sampleCount: 1,
    });
  });
});

describe("billableChatsByPhoneNumber", () => {
  it("counts a single inbound + reply with no return as one chat", async () => {
    const { owner, conversation } =
      await setupOwnerWithConversation("bc-single");
    const opensAt = utcMidnight(-1);
    await createTestMessage(conversation.id, {
      sentBy: "customer",
      createdAt: opensAt,
    });
    await createTestMessage(conversation.id, {
      sentBy: "bot",
      createdAt: new Date(opensAt.getTime() + 60_000),
    });

    const count = await billableChatsByPhoneNumber(
      owner,
      conversation.phoneNumberId,
      testRange(7),
    );

    expect(count).toBe(1);
  });

  it("counts a return 25h after the last customer message as a second chat", async () => {
    const { owner, conversation } = await setupOwnerWithConversation("bc-25h");
    const opensAt = utcMidnight(-2);
    await createTestMessage(conversation.id, {
      sentBy: "customer",
      createdAt: opensAt,
    });
    await createTestMessage(conversation.id, {
      sentBy: "customer",
      createdAt: new Date(opensAt.getTime() + 25 * 60 * 60 * 1000),
    });

    const count = await billableChatsByPhoneNumber(
      owner,
      conversation.phoneNumberId,
      testRange(7),
    );

    expect(count).toBe(2);
  });

  it("keeps a return 23h after the last customer message as the same chat", async () => {
    const { owner, conversation } = await setupOwnerWithConversation("bc-23h");
    const opensAt = utcMidnight(-2);
    await createTestMessage(conversation.id, {
      sentBy: "customer",
      createdAt: opensAt,
    });
    await createTestMessage(conversation.id, {
      sentBy: "customer",
      createdAt: new Date(opensAt.getTime() + 23 * 60 * 60 * 1000),
    });

    const count = await billableChatsByPhoneNumber(
      owner,
      conversation.phoneNumberId,
      testRange(7),
    );

    expect(count).toBe(1);
  });

  it("does not extend or open a chat from a bot reply 30h after the last customer message", async () => {
    const { owner, conversation } =
      await setupOwnerWithConversation("bc-bot30h");
    const opensAt = utcMidnight(-3);
    await createTestMessage(conversation.id, {
      sentBy: "customer",
      createdAt: opensAt,
    });
    await createTestMessage(conversation.id, {
      sentBy: "bot",
      createdAt: new Date(opensAt.getTime() + 30 * 60 * 60 * 1000),
    });

    const count = await billableChatsByPhoneNumber(
      owner,
      conversation.phoneNumberId,
      testRange(7),
    );

    expect(count).toBe(1);
  });

  it("attributes a chat spanning a cycle boundary once, to the cycle it opened in", async () => {
    const { owner, conversation } =
      await setupOwnerWithConversation("bc-boundary");
    const boundary = utcMidnight(0);
    const cycle1 = {
      start: new Date(boundary.getTime() - DAY_MS),
      end: boundary,
    };
    const cycle2 = {
      start: boundary,
      end: new Date(boundary.getTime() + DAY_MS),
    };
    const openedAt = new Date(boundary.getTime() - 60 * 60 * 1000); // 1h before boundary
    const continuesAt = new Date(boundary.getTime() + 2 * 60 * 60 * 1000); // 2h after, 3h gap
    await createTestMessage(conversation.id, {
      sentBy: "customer",
      createdAt: openedAt,
    });
    await createTestMessage(conversation.id, {
      sentBy: "customer",
      createdAt: continuesAt,
    });

    const cycle1Count = await billableChatsByPhoneNumber(
      owner,
      conversation.phoneNumberId,
      cycle1,
    );
    const cycle2Count = await billableChatsByPhoneNumber(
      owner,
      conversation.phoneNumberId,
      cycle2,
    );

    expect(cycle1Count).toBe(1);
    expect(cycle2Count).toBe(0);
  });

  it("never lets a second tenant's phone number return that tenant's chat count", async () => {
    const { owner: owner1 } = await setupOwnerWithConversation("bc-tenant-a");
    const { conversation: conversation2 } =
      await setupOwnerWithConversation("bc-tenant-b");
    await createTestMessage(conversation2.id, {
      sentBy: "customer",
      createdAt: utcMidnight(-1),
    });

    const count = await billableChatsByPhoneNumber(
      owner1,
      conversation2.phoneNumberId,
      testRange(7),
    );

    expect(count).toBe(0);
  });
});

describe("raw SQL safety (task 2.11, extended in 3.6)", () => {
  it("builds every raw query with tagged-template interpolation, never Prisma.raw or an unsafe query", () => {
    const source = readFileSync(
      path.join(__dirname, "../repository.ts"),
      "utf-8",
    );

    const taggedTemplateCalls = source.match(/\$queryRaw(<[^>]*>)?`/g) ?? [];
    // volumeByDay (task 2.9/2.11) and responseTimeByDay (task 3.2/3.6) each
    // build a raw query — both must use the tagged-template form.
    expect(taggedTemplateCalls.length).toBeGreaterThanOrEqual(2);
    expect(source).not.toMatch(/Prisma\.raw\(/);
    expect(source).not.toMatch(/\$queryRawUnsafe/);
    expect(source).not.toMatch(/\$executeRawUnsafe/);
  });
});
