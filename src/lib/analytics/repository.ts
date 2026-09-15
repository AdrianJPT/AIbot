import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isAdmin, messageScope, type ScopedUser } from "@/lib/scope";
import {
  SEND_FAILURE_CODES,
  type SendFailureCode,
} from "@/lib/channels/send-failure";
import { fillUtcDayGaps } from "./day-buckets";
import type { AnalyticsRange, DayBucket, DeliveryHealth } from "./types";

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

  return fillUtcDayGaps(rows, range);
}
