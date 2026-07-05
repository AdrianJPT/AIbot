import type { Conversation } from "@prisma/client";

export type BusinessActivity = {
  conversationsCount: number;
  unreadCount: number;
  lastActivityAt: Date | null;
};

type ConversationActivity = Pick<Conversation, "unreadCount" | "lastMessageAt">;

/**
 * Aggregates conversation-level activity (count, unread sum, most recent
 * message) for a business — or across every business a user owns. Shared
 * between the "Negocios" list (per-business) and the admin "Clientes" panel
 * (per-business and rolled up per-user).
 */
export function aggregateBusinessActivity(
  conversations: ConversationActivity[]
): BusinessActivity {
  const conversationsCount = conversations.length;
  const unreadCount = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const lastActivityAt = conversations.reduce<Date | null>(
    (latest, c) => (!latest || c.lastMessageAt > latest ? c.lastMessageAt : latest),
    null
  );
  return { conversationsCount, unreadCount, lastActivityAt };
}
