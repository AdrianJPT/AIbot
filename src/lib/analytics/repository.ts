import { prisma } from "@/lib/db";
import { messageScope, type ScopedUser } from "@/lib/scope";
import {
  SEND_FAILURE_CODES,
  type SendFailureCode,
} from "@/lib/channels/send-failure";
import type { AnalyticsRange, DeliveryHealth } from "./types";

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
