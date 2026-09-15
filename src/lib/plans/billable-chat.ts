import { prisma } from "@/lib/db";

const BILLABLE_CHAT_GAP_MS = 24 * 60 * 60 * 1000;

/**
 * Point-check mirror of `billableChatsByPhoneNumber`'s `LAG()` derivation
 * (src/lib/analytics/repository.ts, design #1432) for a single conversation
 * — plans-and-quotas task 2.6. Returns `true` when no customer
 * (`sentBy: "customer"`) message exists in the strict 24h window before
 * `at`, meaning `at` opens a NEW billable chat. Only `sentBy: "customer"`
 * rows are ever queried, so a bot reply or operator send in that window
 * never counts as resetting the clock (ruling #1427).
 *
 * Boundary matches the aggregate query exactly: the lower bound is
 * exclusive (`gt`, not `gte`), so a prior customer message exactly 24h
 * before `at` does NOT keep the chat open — a 23h gap returns `false`, a
 * 24h+ gap returns `true`, mirroring the aggregate's
 * `g."createdAt" - g.prev >= interval '24 hours'` condition.
 *
 * Read-only, no writes. Unit 5's enforcement gate calls this before
 * deciding whether to gate a reply.
 */
export async function isNewBillableChat(
  conversationId: string,
  at: Date,
): Promise<boolean> {
  const priorCustomerMessageCount = await prisma.message.count({
    where: {
      conversationId,
      sentBy: "customer",
      createdAt: {
        gt: new Date(at.getTime() - BILLABLE_CHAT_GAP_MS),
        lt: at,
      },
    },
  });

  return priorCustomerMessageCount === 0;
}
