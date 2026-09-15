import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  businessScope,
  eventLogScope,
  isAdmin,
  messageScope,
  type ScopedUser,
} from "@/lib/scope";
import {
  SEND_FAILURE_CODES,
  type SendFailureCode,
} from "@/lib/channels/send-failure";
import { fillUtcDayGaps } from "./day-buckets";
import type {
  AnalyticsRange,
  DayBucket,
  DeliveryHealth,
  ResponseTimeBucket,
  TokenUsage,
} from "./types";

const OUTBOUND_SENDERS = ["bot", "human"] as const;

/**
 * Normalizes a raw `Message.failureCode` to a known `SendFailureCode`. A
 * `null` value (never classified) and any legacy/unrecognized string both
 * fold to `"unknown"` instead of being dropped — spec `Delivery Health
 * Reporting`, "Unclassified failure is counted, not dropped".
 */
function normalizeFailureCode(code: string | null): SendFailureCode {
  if (
    code !== null &&
    (SEND_FAILURE_CODES as readonly string[]).includes(code)
  ) {
    return code as SendFailureCode;
  }
  return "unknown";
}

/**
 * Outbound delivery health for `range`: failure counts by classified cause
 * plus the failure rate (spec `Delivery Health Reporting`). Every filter
 * comes from `messageScope(user)` — see `src/lib/scope.ts` — never a
 * bespoke tenant check, so this can't drift from the rest of the app's
 * ownership rules (design's "Admin vs Owner" section).
 */
export async function deliveryHealth(
  user: ScopedUser,
  range: AnalyticsRange,
): Promise<DeliveryHealth> {
  const outboundWhere = {
    ...messageScope(user),
    sentBy: { in: [...OUTBOUND_SENDERS] },
    createdAt: { gte: range.start, lt: range.end },
  };

  const [totalOutbound, failedGroups] = await Promise.all([
    prisma.message.count({ where: outboundWhere }),
    prisma.message.groupBy({
      by: ["failureCode"],
      where: { ...outboundWhere, status: "failed" },
      _count: { _all: true },
    }),
  ]);

  const byCode = Object.fromEntries(
    SEND_FAILURE_CODES.map((code) => [code, 0]),
  ) as Record<SendFailureCode, number>;

  let totalFailed = 0;
  for (const group of failedGroups) {
    const code = normalizeFailureCode(group.failureCode);
    byCode[code] += group._count._all;
    totalFailed += group._count._all;
  }

  return {
    byCode,
    totalOutbound,
    totalFailed,
    failureRate: totalOutbound === 0 ? 0 : totalFailed / totalOutbound,
  };
}

/**
 * Tenant-filter SQL fragment for this module's raw-query paths. Mirrors
 * `messageScope`'s admin/client branch exactly — always delegates to
 * `isAdmin` from `scope.ts`, so the raw-SQL path can never drift from the
 * Prisma-filter path (design decision "SQL tenant filter"). Not exported:
 * every raw query in this module goes through this one fragment. Built with
 * `Prisma.sql`, so `user.id` is always a parameterized interpolation, never
 * concatenated into the query text.
 */
function tenantFilterSql(user: ScopedUser): Prisma.Sql {
  return isAdmin(user)
    ? Prisma.sql`TRUE`
    : Prisma.sql`b."ownerId" = ${user.id}`;
}

type VolumeRow = { day: string; inbound: number; outbound: number };

/**
 * Inbound/outbound message counts bucketed by UTC calendar day, covering
 * every day in `range` including zero-traffic days (spec `Volume Over
 * Time`). `Message.createdAt` is `TIMESTAMP(3)` with no time zone and is
 * always written as a UTC instant (see prisma/schema.prisma), so
 * `date_trunc('day', ...)` truncates to the UTC day boundary directly with
 * no `AT TIME ZONE` conversion needed. Built entirely from Prisma's tagged
 * template (`prisma.$queryRaw\`...\``), which parameterizes every
 * interpolation — never `Prisma.raw`/string concatenation (task 2.11).
 */
export async function volumeByDay(
  user: ScopedUser,
  range: AnalyticsRange,
): Promise<DayBucket[]> {
  const rows = await prisma.$queryRaw<VolumeRow[]>`
    SELECT
      to_char(date_trunc('day', m."createdAt"), 'YYYY-MM-DD') AS day,
      COUNT(*) FILTER (WHERE m."sentBy" = 'customer')::int AS inbound,
      COUNT(*) FILTER (WHERE m."sentBy" IN ('bot', 'human'))::int AS outbound
    FROM "Message" m
    JOIN "Conversation" c ON c.id = m."conversationId"
    JOIN "Business" b ON b.id = c."businessId"
    WHERE m."createdAt" >= ${range.start}
      AND m."createdAt" < ${range.end}
      AND ${tenantFilterSql(user)}
    GROUP BY day
    ORDER BY day
  `;

  return fillUtcDayGaps(rows, range, (day) => ({
    day,
    inbound: 0,
    outbound: 0,
  }));
}

type ResponseTimeRow = {
  day: string;
  avgMs: number | null;
  sampleCount: number;
};

/**
 * Elapsed time from each customer message to the next outbound message in
 * the same conversation, averaged per UTC calendar day (spec `Time to
 * Respond`). A customer message with no later outbound reply is excluded
 * entirely by the `JOIN LATERAL ... ON TRUE` below (an inner join: no
 * matching reply row means no joined row at all) — never counted as a
 * zero-duration reply (spec scenario "Conversation with no reply yet").
 *
 * This measures wall-clock elapsed time end to end, so it INCLUDES the
 * configured reply debounce (`Business.replyWindowMs`, including its
 * sliding extension up to 4x — see reply-window-scheduler.ts) as well as
 * actual AI generation time. It is deliberately not decomposed into those
 * two parts here, so callers/UI must never present this figure as "AI
 * latency" (spec: "MUST NOT be presented as AI latency").
 *
 * Built entirely from Prisma's tagged template (task 3.6, extending 2.11's
 * SQL-safety check) — never `Prisma.raw`/string concatenation.
 */
export async function responseTimeByDay(
  user: ScopedUser,
  range: AnalyticsRange,
): Promise<ResponseTimeBucket[]> {
  const rows = await prisma.$queryRaw<ResponseTimeRow[]>`
    SELECT
      to_char(date_trunc('day', m."createdAt"), 'YYYY-MM-DD') AS day,
      AVG(EXTRACT(EPOCH FROM (reply."createdAt" - m."createdAt")) * 1000)::float8 AS "avgMs",
      COUNT(*)::int AS "sampleCount"
    FROM "Message" m
    JOIN "Conversation" c ON c.id = m."conversationId"
    JOIN "Business" b ON b.id = c."businessId"
    JOIN LATERAL (
      SELECT r."createdAt"
      FROM "Message" r
      WHERE r."conversationId" = m."conversationId"
        AND r."sentBy" IN ('bot', 'human')
        AND r."createdAt" > m."createdAt"
      ORDER BY r."createdAt" ASC
      LIMIT 1
    ) reply ON TRUE
    WHERE m."sentBy" = 'customer'
      AND m."createdAt" >= ${range.start}
      AND m."createdAt" < ${range.end}
      AND ${tenantFilterSql(user)}
    GROUP BY day
    ORDER BY day
  `;

  return fillUtcDayGaps(rows, range, (day) => ({
    day,
    avgMs: null,
    sampleCount: 0,
  }));
}

/** A single `EventLog.detail` shape this module recognizes as a real usage sample. */
type UsageDetail = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

/**
 * Narrows an `EventLog.detail` JSON value to `UsageDetail` only when all
 * three numeric fields are present — message-handler.ts's `logEvent` call
 * for `"ai-usage"` still logs a row (with only `conversationId`/`model` in
 * `detail`) when the provider returned no usage block at all, and that row
 * must be skipped here rather than counted as a zero-token sample.
 */
function isUsageDetail(detail: unknown): detail is UsageDetail {
  if (detail === null || typeof detail !== "object") return false;
  const d = detail as Record<string, unknown>;
  return (
    typeof d.promptTokens === "number" &&
    typeof d.completionTokens === "number" &&
    typeof d.totalTokens === "number"
  );
}

/**
 * Raw AI token counts for `range`, summed in TypeScript from `EventLog`
 * rows with `source: "ai-usage"` (design: "no column `SUM`" — the counts
 * live inside the `detail` JSON, which Postgres can't aggregate directly
 * without an unindexable JSON-path expression). Deliberately reports only
 * raw counts, never a dollar figure — there is no pricing table anywhere in
 * this repo, and inventing per-token pricing here would be a silent
 * accuracy claim nothing backs.
 *
 * Scoped via `eventLogScope`, matching the OR-array pattern already used by
 * `src/app/(app)/page.tsx`'s dashboard error count: owned-business ids are
 * resolved here (not derived inside `eventLogScope` itself — see its doc
 * comment) so a client only sees usage tied to a business they own, or to
 * no business at all.
 */
export async function tokenUsage(
  user: ScopedUser,
  range: AnalyticsRange,
): Promise<TokenUsage> {
  const ownedBusinessIds = isAdmin(user)
    ? []
    : (
        await prisma.business.findMany({
          where: businessScope(user),
          select: { id: true },
        })
      ).map((b) => b.id);

  const rows = await prisma.eventLog.findMany({
    where: {
      ...eventLogScope(user, ownedBusinessIds),
      source: "ai-usage",
      createdAt: { gte: range.start, lt: range.end },
    },
    select: { detail: true },
  });

  const totals: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    sampleCount: 0,
  };

  for (const row of rows) {
    if (!isUsageDetail(row.detail)) continue;
    totals.promptTokens += row.detail.promptTokens;
    totals.completionTokens += row.detail.completionTokens;
    totals.totalTokens += row.detail.totalTokens;
    totals.sampleCount += 1;
  }

  return totals;
}

type BillableChatCountRow = { count: number };

/**
 * Counts billable chats opened within `range` for a single phone number
 * (design #1432's `LAG()` derivation, plans-and-quotas task 2.4). A chat
 * opens on a customer (`sentBy: "customer"`) message with no earlier
 * customer message in the preceding 24 hours; bot/operator messages never
 * reset the clock or open a chat (ruling #1427 — only `sentBy: "customer"`
 * rows are ever selected). The `- interval '24 hours'` lookback on the
 * inner query covers a chat that opened before `range.start` and is still
 * open at the boundary, so the outer `LAG()` comparison sees its true
 * previous customer message instead of miscounting it as new (spec
 * scenario "A chat spans a cycle boundary"). `Conversation[phoneNumberId,
 * lastMessageAt]` and `Message[conversationId, createdAt]` (both existing)
 * are what keep this an index range scan per conversation — see task 2.8's
 * EXPLAIN evidence in apply-progress.
 *
 * Tenant filter mirrors `phoneNumberScope`'s ownership rule via
 * `tenantFilterSql` (same pattern as `volumeByDay`/`responseTimeByDay`
 * above): a `phoneNumberId` outside the caller's own businesses matches
 * zero rows instead of leaking another tenant's count. Built entirely from
 * Prisma's tagged template — never `Prisma.raw`/string concatenation.
 */
export async function billableChatsByPhoneNumber(
  user: ScopedUser,
  phoneNumberId: string,
  range: AnalyticsRange,
): Promise<number> {
  const rows = await prisma.$queryRaw<BillableChatCountRow[]>`
    SELECT count(*)::int AS count FROM (
      SELECT m."createdAt",
             LAG(m."createdAt") OVER (
               PARTITION BY m."conversationId" ORDER BY m."createdAt"
             ) AS prev
      FROM "Message" m
      JOIN "Conversation" c ON c.id = m."conversationId"
      JOIN "Business" b ON b.id = c."businessId"
      WHERE c."phoneNumberId" = ${phoneNumberId}
        AND m."sentBy" = 'customer'
        AND m."createdAt" >= ${range.start} - interval '24 hours'
        AND m."createdAt" <  ${range.end}
        AND ${tenantFilterSql(user)}
    ) g
    WHERE g."createdAt" >= ${range.start}
      AND (g.prev IS NULL OR g."createdAt" - g.prev >= interval '24 hours')
  `;

  return rows[0]?.count ?? 0;
}
